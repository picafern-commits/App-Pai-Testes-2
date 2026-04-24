rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    function signedIn() {
      return request.auth != null;
    }

    function myUser() {
      return get(/databases/$(database)/documents/users/$(request.auth.uid)).data;
    }

    function isAdmin() {
      return signedIn() && myUser().role == "admin";
    }

    function isWorker() {
      return signedIn() && myUser().role in ["admin", "gerente", "user"];
    }

    function sameStore(lojaId) {
      return signedIn() && myUser().lojaId == lojaId;
    }

    match /users/{userId} {
      allow read: if signedIn() && (request.auth.uid == userId || isAdmin());
      allow create, delete: if isAdmin();
      allow update: if signedIn() && (request.auth.uid == userId || isAdmin());
    }

    match /brinka_lojas/{lojaId}/fechos/{docId} {
      allow read: if signedIn() && (isAdmin() || sameStore(lojaId));
      allow create: if signedIn() && (isWorker() && sameStore(lojaId));
      allow update, delete: if signedIn() && (isWorker() && sameStore(lojaId));
    }

    match /brinka_lojas/{lojaId}/backups_diarios/{docId} {
      allow read, write: if signedIn() && (isAdmin() || sameStore(lojaId));
    }

    match /brinka_config/{docId} {
      allow read: if signedIn();
      allow write: if isAdmin();
    }
  }
}
