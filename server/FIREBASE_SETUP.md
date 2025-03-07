# Firebase Setup for Feedback System

This guide will help you connect the feedback system to your existing Firebase project (`taiyaki-test1`).

## Step 1: Create a Service Account

1. Go to the [Firebase Console](https://console.firebase.google.com/project/taiyaki-test1/settings/serviceaccounts/adminsdk)
2. Make sure you're on the "taiyaki-test1" project
3. Go to Project Settings > Service accounts
4. Select "Firebase Admin SDK"
5. Click "Generate new private key"
6. Save the JSON file

## Step 2: Set Up the Server

1. Copy the downloaded JSON file to the server directory and rename it to `firebase-service-account.json`
   ```bash
   cp ~/Downloads/taiyaki-test1-firebase-adminsdk-xxxx.json ./server/firebase-service-account.json
   ```

2. Update Firestore Security Rules:
   - Go to [Firebase Console > Firestore > Rules](https://console.firebase.google.com/project/taiyaki-test1/firestore/rules)
   - Add the rules from the `firestore-rules.txt` file to allow the feedback system to write to the `user-feedback` collection
   - Click "Publish"

## Step 3: Test the Setup

1. Run the test script to verify everything is working:
   ```bash
   cd server
   node test-firebase.cjs
   ```

2. Check the output:
   - You should see "Test successful!" message
   - It will create a test document in the `user-feedback` collection and then delete it

## Step 4: Start the Server

```bash
cd server
node simple-server.cjs
```

## Troubleshooting

### Permission Denied Error

If you get a "Permission denied" error, check:
1. Make sure your service account file is correctly placed in the server directory
2. Ensure Firestore security rules are updated to allow write access to `user-feedback` collection
3. Verify the projectId in the code matches your Firebase project

### Port Already in Use

If port 3001 is already in use:
1. The server will automatically try port 3002
2. Check the console output for the actual port being used

### Firebase Connection Issues

If Firebase connection fails:
1. Verify the service account file contents
2. Ensure your Firebase project has Firestore enabled
3. The system will fall back to email if Firebase connection fails 