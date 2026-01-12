
import admin from 'firebase-admin';
import fs from 'fs';
import csv from 'csv-parser';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

// TODO: Replace with the path to your service account key file
const serviceAccount = require('./Service Accounts/inventory-and-sales-59f32-firebase-adminsdk-fbsvc-d2d01545d8.json');

// TODO: Replace with your Firebase project's database URL
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: 'https://inventory-and-sales-59f32-default-rtdb.firebaseio.com'
});

const db = admin.database();

// List of CSV files to migrate
const csvFiles = [
  'Service Accounts/CSV Files/Inventory Management - Inventory Count Log.csv',
  'Service Accounts/CSV Files/Inventory Management - Kampstore Sales.csv'
];

csvFiles.forEach(csvFilePath => {
  const dbNode = csvFilePath.split('/').pop().split('.')[0];
  const ref = db.ref(dbNode);

  fs.createReadStream(csvFilePath)
    .pipe(csv())
    .on('data', (row) => {
      const sanitizedRow = {};
      for (const key in row) {
        const sanitizedKey = key.replace(/\//g, '_');
        sanitizedRow[sanitizedKey] = row[key];
      }
      ref.push(sanitizedRow);
    })
    .on('end', () => {
      console.log(`Data from ${csvFilePath} migrated successfully to node '${dbNode}'!`);
    });
});
