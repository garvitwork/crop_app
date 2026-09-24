"""
1) IMAGE CLASSIFICATION - Crop Disease/Pest Detection
Dataset: Download "PlantVillage Dataset" from Kaggle
https://www.kaggle.com/datasets/emmarex/plantdisease
Unzip it so folder structure looks like:
    dataset/
        Tomato_healthy/
        Tomato_Late_blight/
        Potato_Early_blight/
        ... (one folder per class)
Set DATASET_DIR below to that path.
"""

import os
import json
import numpy as np
import tensorflow as tf
from tensorflow.keras import layers, models
import mlflow
import mlflow.tensorflow
import dagshub
from dotenv import load_dotenv

load_dotenv()

# --- DagsHub / MLflow tracking setup (non-interactive, via env vars) ---
DAGSHUB_REPO_OWNER = os.environ.get("DAGSHUB_REPO_OWNER", "garvitwork")
DAGSHUB_REPO_NAME = os.environ.get("DAGSHUB_REPO_NAME", "crop_app")
DAGSHUB_TOKEN = os.environ.get("DAGSHUB_TOKEN", "")

if DAGSHUB_TOKEN:
    os.environ["MLFLOW_TRACKING_USERNAME"] = DAGSHUB_TOKEN
    os.environ["MLFLOW_TRACKING_PASSWORD"] = DAGSHUB_TOKEN

dagshub.init(repo_owner=DAGSHUB_REPO_OWNER, repo_name=DAGSHUB_REPO_NAME, mlflow=True)
mlflow.tensorflow.autolog(disable=True)  # we log manually below for full control

DATASET_DIR = "dataset/PlantVillage"      # path to kaggle dataset folder
IMG_SIZE = (224, 224)   # MobileNetV2's native ImageNet resolution — 160px was undersized and hurt accuracy
BATCH_SIZE = 32          # smaller batch = more gradient updates per epoch, helps on a small dataset
EPOCHS = 15
MODEL_PATH = "crop_disease_model.keras"  # native Keras format — avoids HDF5 Lambda-serialization issues

_model = None
_class_names = None

_gate_model = None  # separate general-purpose ImageNet model, used only as a sanity check

# ImageNet label keywords that indicate the photo plausibly shows plant/vegetation material.
# Screenshots, documents, random objects, people, etc. won't match any of these.
PLANT_KEYWORDS = [
    "leaf", "plant", "veget", "fruit", "flower", "tree", "corn", "cabbage", "broccoli",
    "cauliflower", "zucchini", "artichoke", "mushroom", "banana", "pineapple", "strawberry",
    "orange", "lemon", "fig", "pot,", "head_cabbage", "custard_apple", "pomegranate", "acorn",
    "rapeseed", "daisy", "buckeye", "hip", "pepper", "cucumber", "squash", "cardoon",
]


def _get_gate_model():
    global _gate_model
    if _gate_model is None:
        _gate_model = tf.keras.applications.MobileNetV2(weights="imagenet")
    return _gate_model


def is_probably_plant(image_path, top_k=5):
    """Independent sanity check using a generic ImageNet classifier — is this photo
    plausibly plant/vegetation material at all, before we run the specialized disease model?
    This catches screenshots, documents, unrelated objects etc. that the specialized
    model would otherwise be forced to classify into one of its trained disease classes."""
    model = _get_gate_model()
    img = tf.keras.utils.load_img(image_path, target_size=(224, 224))
    arr = tf.keras.utils.img_to_array(img)
    arr = tf.keras.applications.mobilenet_v2.preprocess_input(arr)
    arr = tf.expand_dims(arr, 0)
    preds = model.predict(arr, verbose=0)
    decoded = tf.keras.applications.mobilenet_v2.decode_predictions(preds, top=top_k)[0]

    for (_, label, conf) in decoded:
        label_lower = label.lower()
        if any(kw in label_lower for kw in PLANT_KEYWORDS):
            return True, label, float(conf)
    return False, decoded[0][1], float(decoded[0][2])


def load_data():
    train_ds = tf.keras.utils.image_dataset_from_directory(
        DATASET_DIR, validation_split=0.2, subset="training",
        seed=123, image_size=IMG_SIZE, batch_size=BATCH_SIZE)
    val_ds = tf.keras.utils.image_dataset_from_directory(
        DATASET_DIR, validation_split=0.2, subset="validation",
        seed=123, image_size=IMG_SIZE, batch_size=BATCH_SIZE)
    class_names = train_ds.class_names  # must read before prefetch() wraps the dataset

    # class weights — this dataset is small and almost certainly imbalanced across
    # 15 classes (some crops have far more sub-classes/images than others). Without
    # this, the model just learns to favor whichever classes have the most images.
    counts = np.zeros(len(class_names))
    for _, labels in train_ds.unbatch():
        counts[int(labels.numpy())] += 1
    total = counts.sum()
    class_weight = {i: total / (len(class_names) * c) for i, c in enumerate(counts) if c > 0}
    print("Class counts:", dict(zip(class_names, counts.astype(int))))

    train_ds = train_ds.prefetch(tf.data.AUTOTUNE)
    val_ds = val_ds.prefetch(tf.data.AUTOTUNE)
    return train_ds, val_ds, class_names, class_weight


# augmentation — makes the model robust to real-world photo variation
# (kept moderate: too aggressive on a small dataset makes training unstable)
data_augmentation = models.Sequential([
    layers.RandomFlip("horizontal"),
    layers.RandomRotation(0.1),
    layers.RandomZoom(0.1),
    layers.RandomContrast(0.1),
])


def build_model(num_classes):
    base_model = tf.keras.applications.MobileNetV2(
        input_shape=(*IMG_SIZE, 3), include_top=False, weights="imagenet")
    base_model.trainable = False  # frozen for phase 1

    inputs = layers.Input(shape=(*IMG_SIZE, 3))
    x = data_augmentation(inputs)
    # IMPORTANT: MobileNetV2's ImageNet weights expect inputs scaled to [-1, 1],
    # not [0, 1]. Plain Rescaling(1/255) silently mismatches the pretrained weights.
    # Rescaling(scale, offset) does the exact same math as mobilenet_v2.preprocess_input
    # (x/127.5 - 1, mapping [0,255] to [-1,1]) but is a built-in, fully serializable
    # layer — unlike Lambda, which can't reliably save/reload an external function reference.
    x = layers.Rescaling(scale=1.0 / 127.5, offset=-1.0, name="mnv2_preprocess")(x)
    x = base_model(x, training=False)
    x = layers.GlobalAveragePooling2D()(x)
    x = layers.BatchNormalization()(x)
    x = layers.Dense(256, activation="relu")(x)
    x = layers.Dropout(0.4)(x)
    outputs = layers.Dense(num_classes, activation="softmax")(x)

    model = models.Model(inputs, outputs)
    model.compile(optimizer=tf.keras.optimizers.Adam(learning_rate=1e-3),
                  loss="sparse_categorical_crossentropy",
                  metrics=["accuracy"])
    return model, base_model


class MlflowEpochLogger(tf.keras.callbacks.Callback):
    """Logs every epoch's metrics to the active MLflow run, tagged by phase."""
    def __init__(self, phase):
        super().__init__()
        self.phase = phase

    def on_epoch_end(self, epoch, logs=None):
        logs = logs or {}
        for k, v in logs.items():
            mlflow.log_metric(f"{self.phase}_{k}", float(v), step=epoch)


def train():
    with mlflow.start_run(run_name="crop_disease_training"):
        mlflow.log_params({
            "img_size": IMG_SIZE, "batch_size": BATCH_SIZE,
            "phase1_epochs": EPOCHS, "phase2_epochs": 20,
            "phase1_lr": 1e-3, "phase2_lr": 3e-5,
            "unfrozen_layers": 60, "dropout": 0.4, "dense_units": 256,
            "dataset_dir": DATASET_DIR,
        })

        train_ds, val_ds, class_names, class_weight = load_data()
        mlflow.log_param("num_classes", len(class_names))
        mlflow.log_dict({"class_names": class_names, "class_weight": class_weight}, "class_info.json")

        model, base_model = build_model(len(class_names))

        print("Phase 1: training classifier head (base frozen)...")
        model.fit(
            train_ds, validation_data=val_ds, epochs=EPOCHS, class_weight=class_weight,
            callbacks=[
                tf.keras.callbacks.EarlyStopping(monitor="val_accuracy", patience=6, restore_best_weights=True),
                tf.keras.callbacks.ReduceLROnPlateau(monitor="val_loss", factor=0.5, patience=3, min_lr=1e-6),
                MlflowEpochLogger("phase1"),
            ],
        )

        # Phase 2: fine-tune more of the pretrained base at a low learning rate, with its
        # own fresh LR schedule (reusing phase 1's decayed LR here would stall training).
        print("Phase 2: fine-tuning top layers of MobileNetV2...")
        base_model.trainable = True
        for layer in base_model.layers[:-60]:  # unfreeze roughly the top third of the network
            layer.trainable = False

        model.compile(optimizer=tf.keras.optimizers.Adam(learning_rate=3e-5),
                      loss="sparse_categorical_crossentropy",
                      metrics=["accuracy"])
        model.fit(
            train_ds, validation_data=val_ds, epochs=20, class_weight=class_weight,
            callbacks=[
                tf.keras.callbacks.EarlyStopping(monitor="val_accuracy", patience=6, restore_best_weights=True),
                tf.keras.callbacks.ReduceLROnPlateau(monitor="val_loss", factor=0.5, patience=3, min_lr=1e-7),
                MlflowEpochLogger("phase2"),
            ],
        )

        val_loss, val_acc = model.evaluate(val_ds)
        print(f"Final validation accuracy: {val_acc*100:.1f}%")
        mlflow.log_metric("final_val_accuracy", float(val_acc))
        mlflow.log_metric("final_val_loss", float(val_loss))

        model.save(MODEL_PATH)
        with open("class_names.txt", "w") as f:
            f.write("\n".join(class_names))
        print("Model saved to", MODEL_PATH)

        # log artifacts + metrics.json for DVC to pick up as a tracked metric file
        mlflow.log_artifact(MODEL_PATH)
        mlflow.log_artifact("class_names.txt")
        with open("metrics.json", "w") as f:
            json.dump({"final_val_accuracy": float(val_acc), "final_val_loss": float(val_loss)}, f, indent=2)
        mlflow.log_artifact("metrics.json")


def _get_model():
    global _model, _class_names
    if _model is None:
        _model = tf.keras.models.load_model(MODEL_PATH)
        _class_names = open("class_names.txt").read().splitlines()
    return _model, _class_names


def predict(image_path):
    model, class_names = _get_model()  # loads once, cached for all later calls

    img = tf.keras.utils.load_img(image_path, target_size=IMG_SIZE)
    img_array = tf.keras.utils.img_to_array(img)
    img_array = tf.expand_dims(img_array, 0)

    preds = model.predict(img_array)
    idx = np.argmax(preds[0])
    result = {"class": class_names[idx], "confidence": float(np.max(preds[0]))}
    print("Prediction:", result)
    return result


if __name__ == "__main__":
    if not os.path.exists(MODEL_PATH):
        print("Training model on dataset in:", DATASET_DIR)
        train()
    else:
        print("Model already trained. Testing prediction...")
    # Example usage (replace with a real image path to test):
    # predict("dataset/Tomato_Late_blight/sample.jpg")