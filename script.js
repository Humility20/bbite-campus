import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import { getFirestore, doc, setDoc, getDoc } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

const firebaseConfig = {
    apiKey: "AIzaSyDleckycfk_xnbhXMnPivz3F1NCS9x5wCQ",
    authDomain: "bbite-campus.firebaseapp.com",
    projectId: "bbite-campus",
    storageBucket: "bbite-campus.firebasestorage.app",
    messagingSenderId: "565374480300",
    appId: "1:565374480300:web:01ca31aa952835a6d0d409"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// Fungsi kompresi gambar instan
function compressImage(file, callback) {
    const reader = new FileReader();
    reader.onload = function(e) {
        const img = new Image();
        img.onload = function() {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            
            const MAX_SIZE = 150;
            let width = img.width;
            let height = img.height;

            if (width > height) {
                if (width > MAX_SIZE) { height *= MAX_SIZE / width; width = MAX_SIZE; }
            } else {
                if (height > MAX_SIZE) { width *= MAX_SIZE / height; height = MAX_SIZE; }
            }
            
            canvas.width = width;
            canvas.height = height;
            ctx.drawImage(img, 0, 0, width, height);
            
            const dataUrl = canvas.toDataURL('image/jpeg', 0.6);
            callback(dataUrl);
        }
        img.src = e.target.result;
    }
    reader.readAsDataURL(file);
}

// Cek status autentikasi user
onAuthStateChanged(auth, async (user) => {
    if (user) {
        // Format Nama
        let displayName = user.displayName;
        if (!displayName) displayName = user.email.split('@')[0];
        const nameParts = displayName.split(/[.\s_-]+/);
        let firstName = nameParts[0];
        firstName = firstName.charAt(0).toUpperCase() + firstName.slice(1).toLowerCase();
        const formattedName = nameParts.map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');

        // Inisial
        let initials = nameParts[0].charAt(0).toUpperCase(); 
        if (nameParts.length > 1) {
            initials += nameParts[1].charAt(0).toUpperCase(); 
        } else if (nameParts[0].length > 1) {
            initials += nameParts[0].charAt(1).toUpperCase(); 
        }

        // ==========================================
        // 1. LOGIKA KHUSUS HOME MAHASISWA
        // ==========================================
        const userGreeting = document.getElementById("userGreeting");
        if (userGreeting) {
            userGreeting.innerText = `Hi, ${firstName}!`;
            const userInitials = document.getElementById("userInitials");
            if (userInitials) {
                userInitials.innerText = initials;
                
                // Ambil foto dari Firestore
                try {
                    const docSnap = await getDoc(doc(db, "users", user.uid));
                    if (docSnap.exists() && docSnap.data().photoBase64) {
                        userInitials.innerHTML = `<img src="${docSnap.data().photoBase64}" style="width:100%; height:100%; border-radius:50%; object-fit:cover;">`;
                        userInitials.style.backgroundColor = "transparent";
                    }
                } catch (error) {
                    console.log("Error mengambil foto Home:", error);
                }
            }
        }

        // ==========================================
        // 2. LOGIKA KHUSUS HALAMAN PROFIL
        // ==========================================
        const infoNameElement = document.getElementById("infoName");
        if (infoNameElement) { 
            infoNameElement.innerText = formattedName;
            document.getElementById("infoEmail").innerText = user.email;

            // Load Foto, NIM, dan Role dari Firestore saat halaman dimuat
            try {
                const docSnap = await getDoc(doc(db, "users", user.uid));
                if (docSnap.exists()) {
                    const data = docSnap.data();
                    if (data.photoBase64) document.getElementById("profileImage").src = data.photoBase64;
                    if (data.nim) document.getElementById("infoNim").innerText = data.nim;
                    if (data.role) document.getElementById("infoRole").innerText = data.role;
                }
            } catch (error) {
                console.log("Error mengambil data Profil:", error);
            }

            // Upload Foto & Simpan ke Firestore
            const avatarUpload = document.getElementById('avatarUpload');
            if (avatarUpload) {
                avatarUpload.addEventListener('change', (e) => {
                    const file = e.target.files[0];
                    if (!file) return;

                    const overlay = document.getElementById('uploadOverlay');
                    overlay.style.display = 'flex';
                    overlay.innerText = 'Saving...';

                    compressImage(file, async (base64String) => {
                        document.getElementById("profileImage").src = base64String;
                        
                        try {
                            await setDoc(doc(db, "users", user.uid), {
                                name: formattedName,
                                email: user.email,
                                photoBase64: base64String
                            }, { merge: true });
                            
                            overlay.innerText = 'Saved!';
                            setTimeout(() => { overlay.style.display = 'none'; }, 1000);
                        } catch (error) {
                            alert("Gagal menyimpan foto ke database: " + error.message);
                            overlay.style.display = 'none';
                        }
                    });
                });
            }

            // Edit NIM menggunakan Custom Modal 
            const editNimBtn = document.getElementById('editNimBtn');
            const nimModalOverlay = document.getElementById('nimModalOverlay');
            const nimInputModal = document.getElementById('nimInputModal');
            const btnCancelNim = document.getElementById('btnCancelNim');
            const btnSaveNim = document.getElementById('btnSaveNim');

            if (editNimBtn && nimModalOverlay) {
                editNimBtn.addEventListener('click', () => {
                    const currentNim = document.getElementById("infoNim").innerText;
                    nimInputModal.value = currentNim !== "-" ? currentNim : "";
                    nimModalOverlay.style.display = 'flex';
                });

                btnCancelNim.addEventListener('click', () => {
                    nimModalOverlay.style.display = 'none';
                });

                btnSaveNim.addEventListener('click', async () => {
                    const newNim = nimInputModal.value.trim();
                    if (newNim !== "") {
                        document.getElementById("infoNim").innerText = newNim;
                        try {
                            await setDoc(doc(db, "users", user.uid), {
                                name: formattedName,
                                email: user.email,
                                nim: newNim
                            }, { merge: true });
                        } catch (error) {
                            console.error("Gagal menyimpan NIM:", error);
                        }
                    }
                    nimModalOverlay.style.display = 'none';
                });
            }

            // Edit Role menggunakan Custom Modal
            const editRoleBtn = document.getElementById('editRoleBtn');
            const roleModalOverlay = document.getElementById('roleModalOverlay');
            const roleInputModal = document.getElementById('roleInputModal');
            const btnCancelRole = document.getElementById('btnCancelRole');
            const btnSaveRole = document.getElementById('btnSaveRole');

            if (editRoleBtn && roleModalOverlay) {
                editRoleBtn.addEventListener('click', () => {
                    const currentRole = document.getElementById("infoRole").innerText;
                    roleInputModal.value = currentRole;
                    roleModalOverlay.style.display = 'flex';
                });

                btnCancelRole.addEventListener('click', () => {
                    roleModalOverlay.style.display = 'none';
                });

                btnSaveRole.addEventListener('click', async () => {
                    const newRole = roleInputModal.value;
                    document.getElementById("infoRole").innerText = newRole;
                    try {
                        await setDoc(doc(db, "users", user.uid), {
                            name: formattedName,
                            email: user.email,
                            role: newRole
                        }, { merge: true });
                    } catch (error) {
                        console.error("Gagal menyimpan Role:", error);
                    }
                    roleModalOverlay.style.display = 'none';
                });
            }
        }

    } else {
        // Redirection aman ke halaman login jika user belum terautentikasi
        const path = window.location.pathname;
        if (!path.includes("login.html") && !path.includes("signup.html") && !path.includes("forgot.html") && !path.includes("reset-password.html") && !path.includes("index.html") && !path.includes("admin.html")) {
            window.location.href = "index.html";
        }
    }
});

// Logika Log Out Global
const logoutBtn = document.getElementById("logoutBtn");
const logoutModalOverlay = document.getElementById("logoutModalOverlay");
const btnCancelLogout = document.getElementById("btnCancelLogout");
const btnConfirmLogout = document.getElementById("btnConfirmLogout");

if (logoutBtn && logoutModalOverlay) {
    logoutBtn.addEventListener("click", () => {
        logoutModalOverlay.style.display = "flex";
    });

    btnCancelLogout.addEventListener("click", () => {
        logoutModalOverlay.style.display = "none";
    });

    btnConfirmLogout.addEventListener("click", () => {
        signOut(auth).then(() => {
            window.location.href = "index.html";
        }).catch((error) => {
            alert("Gagal keluar: " + error.message);
        });
    });
}