import { initializeApp } from "firebase/app";
import { 
  getAuth, 
  GoogleAuthProvider, 
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  onAuthStateChanged,
  signOut as firebaseSignOut,
  browserPopupRedirectResolver,
  browserSessionPersistence,
  setPersistence
} from "firebase/auth";
import { getAnalytics } from "firebase/analytics";
import { 
  getFirestore, 
  collection, 
  addDoc, 
  getDocs, 
  query, 
  where, 
  deleteDoc,
  doc,
  getDoc,
  setDoc
} from "firebase/firestore";
import { getStorage, ref, uploadBytes, getDownloadURL, deleteObject } from "firebase/storage";

// Your Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyD5jEQV3jxCVHn4t5Ruopklmjyt0ZfL3M8",
  authDomain: "taiyaki-test1.firebaseapp.com",
  projectId: "taiyaki-test1",
  storageBucket: "taiyaki-test1.firebasestorage.app",
  messagingSenderId: "815257559066",
  appId: "1:815257559066:web:0972b748161292aca0b1a3",
  measurementId: "G-FJ8C8CZJJ2"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);

// Set persistence to session (survives page reloads but not browser close)
// This makes authentication state more reliable
setPersistence(auth, browserSessionPersistence).catch((error) => {
  console.error("Error setting auth persistence:", error);
});

// Initialize Analytics (if in browser environment)
let analytics;
if (typeof window !== 'undefined') {
  analytics = getAnalytics(app);
}

// Flag for tracking if we should refresh after auth
export const setAuthRefreshFlag = (value = true) => {
  if (typeof window !== 'undefined') {
    localStorage.setItem('fishcad_auth_refresh', value ? 'true' : 'false');
  }
};

// Check and consume refresh flag
export const shouldRefreshAfterAuth = () => {
  if (typeof window !== 'undefined') {
    const shouldRefresh = localStorage.getItem('fishcad_auth_refresh') === 'true';
    if (shouldRefresh) {
      // Consume the flag
      localStorage.removeItem('fishcad_auth_refresh');
    }
    return shouldRefresh;
  }
  return false;
};

// Google provider setup with custom parameters
const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({
  prompt: 'select_account'
});

// Flag to prevent duplicate sign-in attempts
let isSigningIn = false;

// Function to create or update user in Firestore
const setupUserInFirestore = async (user) => {
  try {
    // Get a reference to the user document
    const userDocRef = doc(db, 'users', user.uid);
    
    // Check if the user document exists
    const userDoc = await getDoc(userDocRef);
    
    // If user document doesn't exist, this is a new user - create with trial
    if (!userDoc.exists()) {
      console.log("New user detected - setting up 1-hour Pro trial");
      
      // Calculate trial end date (1 hour from now instead of 24 hours)
      const trialEndDate = new Date();
      trialEndDate.setHours(trialEndDate.getHours() + 1);
      
      // Create user document with trial information
      const userData = {
        uid: user.uid,
        email: user.email,
        displayName: user.displayName,
        photoURL: user.photoURL,
        createdAt: new Date(),
        isPro: true,
        trialActive: true,
        trialEndDate: trialEndDate,
        subscriptionStatus: 'trialing',
        subscriptionEndDate: trialEndDate,
        subscriptionPlan: 'trial',
        modelsRemainingThisMonth: Infinity, // Pro features during trial
        lastResetDate: new Date().toISOString().substring(0, 7),
      };
      
      // Use setDoc to create the document
      await setDoc(userDocRef, userData);
      console.log("Created new user with Pro trial:", user.uid);
      return userData;
    }
    
    return userDoc.data();
  } catch (error) {
    console.error("Error setting up user in Firestore:", error);
    throw error;
  }
};

// Schedule a page refresh after a delay
export const scheduleRefresh = (delay = 1500) => {
  console.log(`Scheduling page refresh in ${delay}ms`);
  setTimeout(() => {
    console.log('Executing scheduled page refresh');
    window.location.reload();
  }, delay);
};

// Check if we have redirect result on page load
// This helps recover from failed popup attempts
if (typeof window !== 'undefined') {
  getRedirectResult(auth)
    .then(async (result) => {
      if (result && result.user) {
        // User successfully signed in with redirect
        console.log("Signed in via redirect:", result.user.uid);
        
        // Set up user in Firestore
        await setupUserInFirestore(result.user);
        
        // If we have a refresh flag set, refresh the page after a short delay
        if (shouldRefreshAfterAuth()) {
          scheduleRefresh();
        }
      }
    })
    .catch((error) => {
      console.error("Redirect sign-in error:", error);
      
      // If there was an error with redirect sign-in, refresh the page
      // to put the app back in a clean state
      scheduleRefresh(2000);
    });
}

// Sign in with Google - tries popup first, falls back to redirect
export const signInWithGoogle = async (withRefresh = false) => {
  try {
    // Set refresh flag if requested
    if (withRefresh) {
      setAuthRefreshFlag(true);
    }
    
    // Prevent duplicate sign-in attempts
    if (isSigningIn) {
      console.log("Sign-in already in progress, ignoring duplicate attempt");
      return null;
    }
    
    isSigningIn = true;
    
    // First try popup (preferred)
    try {
      console.log("Attempting sign-in with popup...");
      const result = await signInWithPopup(auth, googleProvider, browserPopupRedirectResolver);
      const user = result.user;
      
      // Set up user in Firestore
      await setupUserInFirestore(user);
      
      isSigningIn = false;
      
      // If refresh was requested, refresh the page
      if (withRefresh) {
        scheduleRefresh();
      }
      
      return result;
    } catch (popupError) {
      // If popup fails (like popup blocked), log error and try redirect
      console.warn("Popup sign-in failed, falling back to redirect:", popupError.message);
      
      // Check for popup blocked error
      if (
        popupError.code === 'auth/popup-blocked' || 
        popupError.code === 'auth/popup-closed-by-user' ||
        popupError.code === 'auth/cancelled-popup-request'
      ) {
        // Fall back to redirect method
        // (redirect will always refresh the page after completion)
        await signInWithRedirect(auth, googleProvider);
        
        // This page will reload, but we set the flag to false just in case
        isSigningIn = false;
        
        // Return null since we're redirecting
        return null;
      }
      
      // For other errors, refresh the page to clear any bad state
      if (typeof window !== 'undefined') {
        console.log("Triggering page refresh after sign-in error");
        scheduleRefresh(1000);
      }
      
      // For other errors, rethrow
      isSigningIn = false;
      throw popupError;
    }
  } catch (error) {
    console.error("Error signing in with Google", error);
    isSigningIn = false;
    
    // If there's any error, it's good to refresh the page to clear bad state
    if (typeof window !== 'undefined' && withRefresh) {
      scheduleRefresh(1500);
    }
    
    throw error;
  }
};

// Sign out with optional page refresh
export const signOut = async (withRefresh = false) => {
  try {
    await firebaseSignOut(auth);
    
    // Refresh page after successful sign out if requested
    if (withRefresh && typeof window !== 'undefined') {
      console.log("Refreshing page after sign out");
      scheduleRefresh();
    }
  } catch (error) {
    console.error("Error signing out", error);
    
    // Even if sign out fails, try refreshing to clear state
    if (withRefresh && typeof window !== 'undefined') {
      console.log("Refreshing page after sign out error");
      scheduleRefresh(1500);
    }
    
    throw error;
  }
};

// Get current user
export const getCurrentUser = () => {
  return auth.currentUser;
};

// Auth state observer
export const onAuthStateChange = (callback) => {
  return onAuthStateChanged(auth, callback);
};

// User assets functions
export const uploadAsset = async (userId, file, modelName) => {
  try {
    // Create a storage reference
    const storageRef = ref(storage, `user-assets/${userId}/${file.name}`);
    
    // Upload the file
    const snapshot = await uploadBytes(storageRef, file);
    
    // Get the download URL
    const downloadURL = await getDownloadURL(snapshot.ref);
    
    // Add a document to Firestore
    const assetDoc = await addDoc(collection(db, 'user-assets'), {
      userId,
      name: modelName || file.name,
      fileName: file.name,
      fileType: file.type,
      fileSize: file.size,
      downloadURL,
      createdAt: new Date(),
    });
    
    return { id: assetDoc.id, downloadURL };
  } catch (error) {
    console.error("Error uploading asset", error);
    throw error;
  }
};

export const getUserAssets = async (userId) => {
  try {
    const q = query(collection(db, 'user-assets'), where('userId', '==', userId));
    const querySnapshot = await getDocs(q);
    
    const assets = querySnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
    
    return assets;
  } catch (error) {
    console.error("Error getting user assets", error);
    throw error;
  }
};

export const deleteUserAsset = async (userId, assetId, fileName) => {
  try {
    // Delete from Firestore
    await deleteDoc(doc(db, 'user-assets', assetId));
    
    // Delete from Storage
    const storageRef = ref(storage, `user-assets/${userId}/${fileName}`);
    await deleteObject(storageRef);
    
    return true;
  } catch (error) {
    console.error("Error deleting user asset", error);
    throw error;
  }
};

export { auth, analytics, db, storage }; 