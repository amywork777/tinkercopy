import { initializeApp } from "firebase/app";
import { 
  getAuth, 
  GoogleAuthProvider, 
  signInWithPopup, 
  signOut as firebaseSignOut,
  onAuthStateChanged
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
  doc
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

// Initialize Analytics (if in browser environment)
let analytics;
if (typeof window !== 'undefined') {
  analytics = getAnalytics(app);
}

// Google provider setup
const googleProvider = new GoogleAuthProvider();

// Sign in with Google popup
export const signInWithGoogle = async () => {
  try {
    const result = await signInWithPopup(auth, googleProvider);
    return result.user;
  } catch (error) {
    console.error("Error signing in with Google", error);
    throw error;
  }
};

// Sign out
export const signOut = async () => {
  try {
    await firebaseSignOut(auth);
  } catch (error) {
    console.error("Error signing out", error);
    throw error;
  }
};

// Get current user
export const getCurrentUser = () => {
  return auth.currentUser;
};

// Auth state observer
export const onAuthStateChange = (callback: (user: any) => void) => {
  return onAuthStateChanged(auth, callback);
};

// User assets functions
export const uploadAsset = async (userId: string, file: File, modelName: string) => {
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

export const getUserAssets = async (userId: string) => {
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

export const deleteUserAsset = async (userId: string, assetId: string, fileName: string) => {
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