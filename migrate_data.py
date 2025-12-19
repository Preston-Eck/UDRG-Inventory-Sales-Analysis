#!/usr/bin/env python3

import pandas as pd
import firebase_admin
from firebase_admin import credentials, db
import os

# TODO: Replace with the path to your service account key file
cred = credentials.Certificate("Service Accounts/inventory-and-sales-59f32-firebase-adminsdk-fbsvc-d2d01545d8.json")

# TODO: Replace with your Firebase project's database URL
firebase_admin.initialize_app(cred, {
    'databaseURL': "https://inventory-and-sales-59f32-default-rtdb.firebaseio.com"
})

# List of CSV files to migrate
csv_files = [
    'Service Accounts/CSV Files/Inventory Management - Inventory Count Log.csv',
    'Service Accounts/CSV Files/Inventory Management - Sales.csv'
]

for csv_file_path in csv_files:
    # Get the base name of the file to use as the db node
    db_node = os.path.splitext(os.path.basename(csv_file_path))[0]

    # Read data from CSV file
    df = pd.read_csv(csv_file_path)

    # Convert dataframe to a list of dictionaries
    data = df.to_dict(orient='records')

    # Get a reference to the database node
    ref = db.reference(db_node)

    # Push data to the database
    for item in data:
        ref.push().set(item)

    print(f"Data from {csv_file_path} migrated successfully to node '{db_node}'!")
