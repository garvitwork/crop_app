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
import numpy as np
import tensorflow as tf
from tensorflow.keras import layers, models

DATASET_DIR = "dataset/PlantVillage"      # path to kaggle dataset folder
IMG_SIZE = (160, 160)
BATCH_SIZE = 96
EPOCHS = 12
MODEL_PATH = "crop_disease_model.h5"

_model = None
_class_names = None


def load_data():
    train_ds = tf.keras.utils.image_dataset_from_directory(
        DATASET_DIR, validation_split=0.2, subset="training",
        seed=123, image_size=IMG_SIZE, batch_size=BATCH_SIZE)
    val_ds = tf.keras.utils.image_dataset_from_directory(
        DATASET_DIR, validation_split=0.2, subset="validation",
        seed=123, image_size=IMG_SIZE, batch_size=BATCH_SIZE)
    return train_ds, val_ds, train_ds.class_names


def build_model(num_classes):
    base_model = tf.keras.applications.MobileNetV2(
        input_shape=(*IMG_SIZE, 3), include_top=False, weights="imagenet")
    base_model.trainable = False  # freeze pretrained layers

    model = models.Sequential([
        layers.Rescaling(1.0 / 255, input_shape=(*IMG_SIZE, 3)),
        base_model,
        layers.GlobalAveragePooling2D(),
        layers.Dense(128, activation="relu"),
        layers.Dropout(0.3),
        layers.Dense(num_classes, activation="softmax"),
    ])
    model.compile(optimizer=tf.keras.optimizers.Adam(learning_rate=0.0001),
                  loss="sparse_categorical_crossentropy",
                  metrics=["accuracy"])
    return model


def train():
    train_ds, val_ds, class_names = load_data()
    model = build_model(len(class_names))
    model.fit(train_ds, validation_data=val_ds, epochs=EPOCHS)
    model.save(MODEL_PATH)
    with open("class_names.txt", "w") as f:
        f.write("\n".join(class_names))
    print("Model saved to", MODEL_PATH)


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