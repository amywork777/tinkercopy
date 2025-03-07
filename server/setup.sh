#!/bin/bash

# Install required packages
echo "Installing required packages..."
npm install firebase-admin express cors dotenv nodemailer

# Create .env file if it doesn't exist
if [ ! -f .env ]; then
  echo "Creating .env file..."
  cat > .env << EOF
# Email configuration (fallback if Firebase fails)
EMAIL_USER=taiyaki.orders@gmail.com
EMAIL_PASSWORD=lfrq katt exfz jzoh
PORT=3001
NODE_ENV=development

# For production deployment at fishcad.com, use NODE_ENV=production
EOF
  echo ".env file created"
else
  echo ".env file already exists"
fi

echo -e "\nSetup complete!"
echo -e "\nNext steps:"
echo "1. Generate a Firebase service account key and save it as firebase-service-account.json"
echo "2. Update your Firestore security rules"
echo "3. Run 'node test-firebase.cjs' to test the setup"
echo "4. Run 'node simple-server.cjs' to start the server" 