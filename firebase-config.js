// ================================================================
//  🔥 AKİF İLETİŞİM — Firebase Konfigürasyon
//  Kullanım: import { db, auth, storage } from "./firebase-config.js"
//  NOT: Bu dosya ES Module — HTML'de type="module" gerekli
// ================================================================

import { initializeApp }  from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getFirestore }   from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { getAuth }        from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getStorage }     from "https://www.gstatic.com/firebasejs/10.7.1/firebase-storage.js";

const firebaseConfig = {
  apiKey:            "AIzaSyA_qQBvQgAMON13EDSPTUNu58t0W4RD0FA",
  authDomain:        "akif-iletisim-gercekci.firebaseapp.com",
  projectId:         "akif-iletisim-gercekci",
  storageBucket:     "akif-iletisim-gercekci.firebasestorage.app",
  messagingSenderId: "527995566381",
  appId:             "1:527995566381:web:9ef6f0e8c37acbec89fba4",
  measurementId:     "G-D9WD7K857R",
};

const app = initializeApp(firebaseConfig);

export const db      = getFirestore(app);
export const auth    = getAuth(app);
export const storage = getStorage(app);
