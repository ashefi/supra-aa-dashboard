/* Supra AA 1.4.6 - optional Firebase sync. The original localStorage code is untouched. */
import { initializeApp } from 'https://www.gstatic.com/firebasejs/11.6.0/firebase-app.js';
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged, setPersistence, browserLocalPersistence } from 'https://www.gstatic.com/firebasejs/11.6.0/firebase-auth.js';
import { getFirestore, doc, onSnapshot, setDoc, serverTimestamp } from 'https://www.gstatic.com/firebasejs/11.6.0/firebase-firestore.js';

const config = {
  apiKey: 'AIzaSyBxkawyRCAxyxcOP_9yrlh6KbPYY_Jux3Y',
  authDomain: 'supra-aa-dashboard.firebaseapp.com',
  projectId: 'supra-aa-dashboard',
  storageBucket: 'supra-aa-dashboard.firebasestorage.app',
  messagingSenderId: '892334168138',
  appId: '1:892334168138:web:6ffdf31ee0206e75606eb3'
};

const ui = id => document.getElementById(id);
const openBtn = ui('cloudSyncOpenBtn');
const dialog = ui('cloudSyncDialog');
const status = ui('cloudSyncState');
const message = ui('cloudSyncMessage');
const signInBtn = ui('cloudSignInBtn');
const signOutBtn = ui('cloudSignOutBtn');
let auth, db, person = null, unsubscribe = null;
let initComplete = false, processingRemote = false, writeBusy = false;
let queuedValue = null, lastCloudVersion = null;
let sessionId = 0;

const getLocal = () => {
  // Read the SAME key as the pre-existing functioning 1.4.5 dashboard.
  try { return (localStorage.getItem('supra_aa_installed_version_v2') || '').trim(); }
  catch { return (window.installedVersion || '').trim(); }
};
function statusText(value) { status.textContent = value; }
function say(value) { message.textContent = value; }
// Non-blocking cloud update notice: visible briefly, never requests input.
let toastTimer;
function showSyncToast(version) {
  const toast = ui('cloudSyncToast');
  if (!toast) return;
  toast.textContent = `☁ Installed version updated to ${version}`;
  toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toast.hidden = true; }, 3500);
}
function applyCloud(version, notify = true) {
  const previous = getLocal();
  processingRemote = true;
  try {
    // This calls the ORIGINAL function, which saves to the proven localStorage key
    // and updates every existing tachometer, selector and release label.
    window.setInstalledVersion(version);
  } finally { processingRemote = false; }
  lastCloudVersion = version;
  statusText('☁ SYNCED');
  say(`Synced: ${version}`);
  if (notify && previous !== version) showSyncToast(version);
}
async function writeVersion(version) {
  if (!person) return;
  if (!navigator.onLine) { queuedValue = version; statusText('☁ OFFLINE - SAVED LOCALLY'); return; }
  if (writeBusy) { queuedValue = version; return; }
  writeBusy = true;
  statusText('☁ SYNCING...');
  try {
    const target = doc(db, 'users', person.uid);
    await setDoc(target, { installedVersion: version, updatedAt: serverTimestamp() }, { merge: true });
    lastCloudVersion = version;
    if (getLocal() === version) statusText('☁ SYNCED');
    say(`Saved to Google cloud: ${version}`);
  } catch (e) {
    queuedValue = version;
    statusText('☁ PENDING - SAVED LOCALLY');
    say('Cloud save failed. Your local version remains saved. ' + (e.code || e.message || ''));
  } finally {
    writeBusy = false;
    if (queuedValue !== null && person && initComplete && navigator.onLine) {
      const next = queuedValue;
      queuedValue = null;
      if (next !== lastCloudVersion) writeVersion(next);
    }
  }
}
function watchUser(user) {
  const thisSession = ++sessionId;
  if (unsubscribe) { unsubscribe(); unsubscribe = null; }
  person = user;
  initComplete = false;
  queuedValue = null;
  lastCloudVersion = null;
  if (!user) {
    ui('cloudAccountText').textContent = 'Not signed in. Your version remains saved locally on this device.';
    signInBtn.hidden = false;
    signOutBtn.hidden = true;
    openBtn.textContent = '☁ Sync';
    statusText('LOCAL ONLY - SAVED ON DEVICE');
    say('Google sign-in is optional. No local data was cleared.');
    return;
  }
  signInBtn.hidden = true;
  signOutBtn.hidden = false;
  openBtn.textContent = '☁ Account';
  ui('cloudAccountText').textContent = `Signed in: ${user.email || user.displayName || 'Google account'}`;
  statusText('☁ CONNECTING...');
  const target = doc(db, 'users', user.uid);
  let firstSnapshot = true;
  unsubscribe = onSnapshot(target, snapshot => {
    if (thisSession !== sessionId) return;
    const remote = snapshot.exists() && typeof snapshot.data().installedVersion === 'string'
      ? snapshot.data().installedVersion.trim() : '';
    const local = getLocal();
    if (firstSnapshot) {
      firstSnapshot = false;
      initComplete = true;
      lastCloudVersion = remote;
      // If the user deliberately changed their selection while Firebase was
      // connecting, that new local action takes priority over the initial read.
      // Otherwise, an existing cloud value is authoritative on every device.
      if (queuedValue !== null) {
        const pending = queuedValue;
        queuedValue = null;
        if (pending !== remote) writeVersion(pending);
        else statusText('☁ SYNCED');
      } else if (remote && remote !== local) {
        applyCloud(remote, Boolean(local));
      } else if (!remote && local) {
        // First-ever account sync only: seed an empty cloud document.
        say(`Setting up sync with saved local version: ${local}`);
        writeVersion(local);
      } else {
        statusText('☁ SYNCED');
        say(remote ? `Synced: ${remote}` : 'Connected. Select a version to sync.');
      }
      return;
    }
    // A newer remote change from another device arrives in realtime.
    if (snapshot.metadata.hasPendingWrites) return;
    if (writeBusy || queuedValue !== null) return;
    if (remote && remote !== local) {
      // No local modification is pending: the cloud value is authoritative
      // for devices that have already completed their initial sync.
      applyCloud(remote);
    } else if (remote) {
      lastCloudVersion = remote;
      statusText('☁ SYNCED');
    }
  }, err => {
    if (thisSession !== sessionId) return;
    initComplete = false;
    statusText('☁ SYNC UNAVAILABLE');
    say(`Couldn't read cloud data. Local storage still works. ${err.code || err.message || ''}`);
  });
}

openBtn.addEventListener('click', () => dialog.showModal());
ui('cloudCloseBtn').addEventListener('click', () => dialog.close());
dialog.addEventListener('click', e => { if (e.target === dialog) dialog.close(); });
signInBtn.addEventListener('click', async () => {
  if (!auth) { say('Firebase is still loading.'); return; }
  signInBtn.disabled = true;
  say('Opening Google sign-in...');
  try { await signInWithPopup(auth, new GoogleAuthProvider()); }
  catch (e) {
    if (e.code !== 'auth/popup-closed-by-user' && e.code !== 'auth/cancelled-popup-request') {
      say('Google sign-in did not complete: ' + (e.code || e.message) + '. Try opening the website in Chrome or Safari if your installed app blocks the sign-in popup.');
    }
  } finally { signInBtn.disabled = false; }
});
signOutBtn.addEventListener('click', async () => {
  if (!auth) return;
  try { await signOut(auth); } catch (e) { say('Sign-out failed: ' + (e.message || e)); }
});
window.addEventListener('supra:installed-version-changed', event => {
  if (processingRemote || !person) return;
  const version = (event.detail?.version || '').trim();
  if (!version) return; // An empty dropdown choice must not delete cloud data.
  if (!initComplete) { queuedValue = version; statusText('☁ WAITING - SAVED LOCALLY'); return; }
  if (version !== lastCloudVersion) writeVersion(version);
});
window.addEventListener('online', () => {
  if (person && initComplete && queuedValue) {
    const value = queuedValue; queuedValue = null; writeVersion(value);
  }
});

try {
  const firebaseApp = initializeApp(config);
  auth = getAuth(firebaseApp);
  db = getFirestore(firebaseApp);
  // Persistent auth on the same browser/PWA installation.
  await setPersistence(auth, browserLocalPersistence);
  onAuthStateChanged(auth, watchUser, error => {
    statusText('☁ SIGN-IN UNAVAILABLE');
    say(error.message || 'Google sign-in could not initialize. Local storage is unaffected.');
  });
} catch (error) {
  statusText('LOCAL ONLY - CLOUD UNAVAILABLE');
  say(`Cloud features unavailable: ${error.message || error}. Your local version is unaffected.`);
}
