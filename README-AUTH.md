# Setting up Google OAuth for fishcad

This document provides instructions on how to set up Google OAuth for the fishcad application.

## Prerequisites

1. A Google account
2. A registered Google Cloud Platform (GCP) project

## Steps to Set Up Google OAuth

### 1. Create a Google Cloud Platform Project

1. Go to the [Google Cloud Console](https://console.cloud.google.com/).
2. Click "Select a project" at the top of the page.
3. Click "New Project" and create a new project with a name like "fishcad".
4. Wait for the project to be created and select it.

### 2. Configure OAuth Consent Screen

1. Navigate to "APIs & Services" > "OAuth consent screen" from the sidebar.
2. Select "External" as the user type (unless you have a Google Workspace account).
3. Fill in the required information:
   - App name: "fishcad"
   - User support email: Your email address
   - Developer contact information: Your email address
4. Click "Save and Continue".
5. Add the following scopes:
   - `./auth/userinfo.email`
   - `./auth/userinfo.profile`
   - `./auth/openid`
6. Click "Save and Continue".
7. Add any test users if needed and finish the setup.

### 3. Create OAuth Credentials

1. Navigate to "APIs & Services" > "Credentials" from the sidebar.
2. Click "Create Credentials" and select "OAuth client ID".
3. Choose "Web application" as the application type.
4. Give it a name like "fishcad Web Client".
5. Add authorized JavaScript origins:
   - For development: `http://localhost:3000`
   - For production: Your production domain
6. Add authorized redirect URIs:
   - For development: `http://localhost:3000/api/auth/callback/google`
   - For production: `https://your-production-domain.com/api/auth/callback/google`
7. Click "Create".
8. Note the Client ID and Client Secret - you'll need these for your application.

### 4. Update Environment Variables

In your `.env` file, update the following variables with the credentials obtained in the previous step:

```
GOOGLE_CLIENT_ID=your-client-id
GOOGLE_CLIENT_SECRET=your-client-secret
```

### 5. Set Up Database

1. Create a PostgreSQL database for your application.
2. Update the `DATABASE_URL` in the `.env` file with your database connection string.
3. Run the migrations to create the necessary tables:

```
npm run db:push
```

## Testing Authentication

1. Start the application:

```
npm run dev
```

2. Navigate to `http://localhost:3000` in your browser.
3. You should be redirected to the login page.
4. Click "Sign in with Google" and follow the authentication flow.
5. After successful authentication, you'll be redirected back to the application.

## Notes

- In development, make sure to use the same port (default: 3000) for both client and server.
- For production, update the OAuth credentials in the Google Cloud Console with your production domain.
- The session secret should be changed to a secure value in production. 