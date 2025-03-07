# Feedback System with Firebase Integration

This server integrates a feedback form with Firebase Firestore to store all user feedback in a centralized database. This makes it easy to view, query, and analyze feedback data in real-time.

## Features

- Collects user feedback (name, email, and message)
- Stores all feedback in Firebase Firestore database
- Falls back to email if Firebase integration fails
- CORS-enabled API for use with web clients
- Port fallback mechanism for local development

## Setup Instructions

### 1. Install Dependencies

```bash
npm install
```

### 2. Set Up Firebase

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Create a new project (or select an existing one)
3. Enable Firestore Database
   - Go to "Firestore Database" in the left sidebar
   - Click "Create database"
   - Choose either production or test mode (depends on your security needs)
4. Set up Authentication (if needed)
   - Go to "Authentication" in the left sidebar
   - Enable any authentication methods you need
5. Create a Service Account
   - Go to Project Settings (gear icon) > Service Accounts
   - Click "Generate new private key"
   - Save the JSON file as `firebase-service-account.json` in the server directory

### 3. Configure Firestore Security Rules

1. Go to "Firestore Database" > "Rules" tab
2. Update your security rules to allow writing to the feedback collection:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Allow write access to the feedback collection
    match /feedback/{document=**} {
      allow read, write: if request.auth != null || true; // For testing - in production, secure this
    }
    
    // Default rule - deny everything else
    match /{document=**} {
      allow read, write: if false;
    }
  }
}
```

### 4. Configure Environment Variables

Either:

1. Copy your service account JSON file to the server directory:
   - Name it `firebase-service-account.json`

OR

2. Add your service account JSON to the `.env` file (escape all quotes):
   ```
   FIREBASE_SERVICE_ACCOUNT={"type":"service_account","project_id":"your-project-id",...}
   ```

### 5. Test the Firebase Integration

Run the test script to verify everything is working:

```bash
node test-firebase.cjs
```

This should add a test document to your Firestore database and then delete it.

### 6. Start the Server

```bash
node simple-server.cjs
```

## API Endpoints

### Submit Feedback

**Endpoint:** `POST /api/submit-feedback`

**Request Body:**
```json
{
  "name": "User Name",
  "email": "user@example.com",
  "feedback": "This is user feedback"
}
```

**Success Response:**
```json
{
  "success": true,
  "message": "Feedback submitted successfully",
  "savedToFirebase": true,
  "feedbackId": "xyz123"
}
```

## Firestore Data Structure

The feedback data is stored in Firestore with the following structure:

**Collection:** `feedback`

**Document Fields:**
- `timestamp`: ISO timestamp of when the feedback was submitted
- `sourceDomain`: Domain where the feedback was submitted from
- `name`: User's name
- `email`: User's email address
- `feedback`: Feedback content
- `createdAt`: Server timestamp

## Troubleshooting

### Firebase Authentication Issues

If you encounter authentication issues:

1. Make sure your service account credentials are correct
2. Verify that your service account has the proper permissions
3. Check Firestore security rules to ensure they allow writing to the feedback collection

### Port Already in Use

If port 3001 is already in use, the server will automatically try to use port 3002. 