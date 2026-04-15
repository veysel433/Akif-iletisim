/* ================================================================
   AKİF İLETİŞİM — admin.js v7 (Modernized)
   ✅ Cloudinary otomatik görsel yükleme + URL dönüştürme
   ✅ Progress bar ile upload durumu
   ✅ SweetAlert2 kategori onay penceresi
   ✅ Bootstrap 5 uyumlu, temiz UI
   ================================================================ */

/* ── CLOUDINARY AYARLARI ── */
/* Kendi Cloudinary hesabınızdaki cloud_name'i ve unsigned upload preset'i girin */
var CLOUDINARY_CLOUD_NAME  = 'YOUR_CLOUD_NAME';   // Örn: 'akif-iletisim'
var CLOUDINARY_UPLOAD_PRESET = 'YOUR_PRESET';     // Unsigned preset adı

/* ── FİREBASE ── */
var firebaseConfig = {
  apiKey:            'AIzaSyA_qQBvQgAMON13EDSPTUNu58t0W4RD0FA',
  authDomain:        'akif-iletisim-gercekci.firebaseapp.com',
  projectId:         'akif-iletisim-gercekci',
  storageBucket:     'akif-iletisim-gercekci.appspot.com',
  messagingSenderId: '527995566381',
  appId:             '1:527995566381:web:9ef6f0e8c37acbec89fba4',
  measurementId:     'G-D9WD7K857R',
};

firebase.initializeApp(firebaseConfig);
var auth = firebase.auth();
var db   = firebase.firestore();

var WA_NUMBER   = '905419705263';
var ADMIN_EMAIL = 'seyfullahkaratas51@gmail.com';

/* ── STATE ── */
var allProducts   = [];
var allCategories = [];
var allOrders     = [];
var currentPanel  = 'dashboard';
var activeImgTab  = 'file';
var pendingImages  = []; // { url, source }
var ordersUnsub   = null;

var DEFAULT_CATS = ['Telefon','Tablet','Laptop','Aksesuar','Kulaklık','Saat','Tv & Ses Sistemi','Oyun','Diğer'];

/* ════════════════════════════════════════
   AUTH
════════════════════════════════════════ */
auth.onAuthStateChanged(function(user) {
  if (user) {
    if ((user.email || '').toLowerCase() !== ADMIN_EMAIL.toLowerCase()) {
      auth.signOut();
      showAuthError('Bu hesap admin paneline yetkili değil.');
      return;
    }
    document.getElementById('auth-overlay').style.display = 'none';
    document.getElementById('app').style.display          = 'block';
    var email = user.email || 'admin';
    document.getElementById('user-email-display').textContent = email;
    document.getElementById('user-initial').textContent       = email[0].toUpperCase();
    initAdmin();
  } else {
    document.getElementById('auth-overlay').style.display = 'flex';
    document.getElementById('app').style.display          = 'none';
  }
});

async function initAdmin() {
  await loadCategories();
  loadDashboard();
  loadProducts();
  loadOrders();
}

async function adminLogin() {
  var email    = document.getElementById('login-email').value.trim();
  var password = document.getElementById('login-password').value;
  var btn      = document.getElementById('login-btn');
  if (!email || !password) { showAuthError('E-posta ve şifre zorunludur.'); return; }
  if (email.toLowerCase() !== ADMIN_EMAIL.toLowerCase()) { showAuthError('Sadece yetkili admin e-postası ile giriş yapılabilir.'); return; }

  btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Giriş yapılıyor…';
  btn.disabled  = true;
  document.getElementById('auth-error').style.display = 'none';

  try {
    await auth.signInWithEmailAndPassword(email, password);
  } catch(err) {
    btn.innerHTML = '<i class="fa-solid fa-right-to-bracket"></i> Giriş Yap';
    btn.disabled  = false;
    var map = {
      'auth/wrong-password':     'Şifre hatalı.',
      'auth/user-not-found':     'Bu e-posta kayıtlı değil.',
      'auth/invalid-credential': 'E-posta veya şifre hatalı.',
      'auth/too-many-requests':  'Çok fazla deneme. Lütfen bekleyin.',
    };
    showAuthError(map[err.code] || 'Giriş başarısız: ' + err.message);
  }
}

function showAuthError(msg) {
  var box = document.getElementById('auth-error');
  document.getElementById('auth-error-text').textContent = msg;
  box.style.display = 'flex';
}

async function adminLogout() {
  await auth.signOut();
  showToast('Çıkış yapıldı.', 'info');
}

function togglePw() {
  var inp  = document.getElementById('login-password');
  var icon = document.getElementById('pw-eye-icon');
  if (inp.type === 'password') {
    inp.type = 'text'; icon.className = 'fa-regular fa-eye-slash';
  } else {
    inp.type = 'password'; icon.className = 'fa-regular fa-eye';
  }
}

/* ════════════════════════════════════════
   KATEGORİ
════════════════════════════════════════ */
async function loadCategories() {
  try {
    var snap = await db.collection('categories').get();
    allCategories = snap.docs.map(function(d){ return { id:d.id, name:d.data().name }; });
  } catch(e) { allCategories = []; }
  buildCategoryOptions();
  updateSidebarCategories();
}

function allCatNames() {
  var customNames = allCategories.map(function(c){ return c.name; });
  var merged = DEFAULT_CATS.slice();
  customNames.forEach(function(n){ if (!merged.includes(n)) merged.push(n); });
  return merged;
}

function findCustomCategoryByName(name) {
  var n = String(name || '').trim().toLowerCase();
  return allCategories.find(function(c){ return String(c.name || '').trim().toLowerCase() === n; }) || null;
}

function isDefaultCategory(name) {
  return DEFAULT_CATS.some(function(c){ return c.toLowerCase() === String(name || '').trim().toLowerCase(); });
}

function buildCategoryOptions() {
  var sel  = document.getElementById('p-category');
  var fsel = document.getElementById('cat-filter-select');
  var names = allCatNames();
  var html  = '<option value="">Seçiniz…</option>';
  names.forEach(function(c){ html += '<option value="'+escHtml(c)+'">'+escHtml(c)+'</option>'; });
  html += '<option value="__new__">+ Yeni Kategori Ekle…</option>';
  if (sel) sel.innerHTML = html;
  if (fsel) {
    var fhtml = '<option value="">Tüm Kategoriler</option>';
    names.forEach(function(c){ fhtml += '<option value="'+escHtml(c)+'">'+escHtml(c)+'</option>'; });
    fsel.innerHTML = fhtml;
  }
}

function updateSidebarCategories() {
  var list = document.getElementById('nav-cat-list');
  if (!list) return;
  list.innerHTML = allCatNames().map(function(cat){
    var isCustom = !!findCustomCategoryByName(cat) && !isDefaultCategory(cat);
    return '<div class="cat-nav-item">' +
      '<button class="cat-nav-btn" onclick="switchPanel(\'products\',document.querySelector(\'[data-panel=products]\')); filterByCategory2(\''+escJs(cat)+'\')">' +
        '<i class="fa-solid fa-folder" style="font-size:10px;"></i> '+escHtml(cat)+
      '</button>' +
      (isCustom
        ? '<button class="cat-nav-del" title="Kategoriyi Sil" onclick="deleteCategory(\''+escJs(cat)+'\')"><i class="fa-solid fa-trash-can"></i></button>'
        : '') +
    '</div>';
  }).join('');
}

function onCategoryChange(val) {
  var wrap = document.getElementById('new-cat-wrap');
  if (val === '__new__') {
    wrap.style.display = 'block';
    document.getElementById('p-category').value = '';
    document.getElementById('new-cat-input').focus();
  } else {
    wrap.style.display = 'none';
  }
}

async function addCustomCategory() {
  var name = document.getElementById('new-cat-input').value.trim();
  if (!name) return;
  if (allCatNames().map(function(c){ return c.toLowerCase(); }).includes(name.toLowerCase())) {
    showToast('Bu kategori zaten mevcut.', 'error'); return;
  }
  try {
    var ref = await db.collection('categories').add({ name:name, createdAt:firebase.firestore.FieldValue.serverTimestamp() });
    allCategories.push({ id:ref.id, name:name });
    buildCategoryOptions(); updateSidebarCategories();
    document.getElementById('p-category').value = name;
    document.getElementById('new-cat-wrap').style.display = 'none';
    document.getElementById('new-cat-input').value = '';
    showToast('"'+name+'" kategorisi eklendi.', 'success');
  } catch(err) { showToast('Kategori kaydedilemedi: '+err.message, 'error'); }
}

function cancelNewCategory() {
  document.getElementById('new-cat-wrap').style.display = 'none';
  document.getElementById('p-category').value = '';
  document.getElementById('new-cat-input').value = '';
}

/* ── Kategori Silme — SweetAlert2 ile onay penceresi ── */
async function deleteCategory(name) {
  var found = findCustomCategoryByName(name);
  if (!found) { showToast('Bu kategori silinemez.', 'error'); return; }

  var pCount = allProducts.filter(function(p){
    return (p.data.category || '').toLowerCase() === name.toLowerCase();
  }).length;

  /* SweetAlert2 onay penceresi */
  var result = await Swal.fire({
    title: '<span style="font-size:18px;font-weight:700;">"'+escHtml(name)+'" silinsin mi?</span>',
    html: pCount > 0
      ? '<div style="color:#f87171;font-size:14px;margin-bottom:8px;"><i class="fa-solid fa-triangle-exclamation"></i> Bu kategoriye ait <b>'+pCount+' ürün</b> etkilenecek!</div>' +
        '<div style="color:#8b9bb8;font-size:13px;">Söz konusu ürünler otomatik olarak <b>"Diğer"</b> kategorisine taşınacak.</div>'
      : '<div style="color:#8b9bb8;font-size:13px;">Bu işlem geri alınamaz.</div>',
    icon: 'warning',
    showCancelButton: true,
    confirmButtonText: '<i class="fa-solid fa-trash"></i> Evet, Sil',
    cancelButtonText: 'Vazgeç',
    background: '#131825',
    color: '#e8edf6',
    confirmButtonColor: '#c0392b',
    cancelButtonColor: '#1a2133',
    customClass: {
      popup: 'swal-popup-custom',
      confirmButton: 'swal-confirm-custom',
      cancelButton: 'swal-cancel-custom',
    },
    focusCancel: true,
  });

  if (!result.isConfirmed) return;

  try {
    if (pCount > 0) {
      var snap  = await db.collection('products').where('category','==',name).get();
      var batch = db.batch();
      snap.docs.forEach(function(doc){
        batch.update(doc.ref, { category:'Diğer', updatedAt:firebase.firestore.FieldValue.serverTimestamp() });
      });
      await batch.commit();
    }
    await db.collection('categories').doc(found.id).delete();
    allCategories = allCategories.filter(function(c){ return c.id !== found.id; });
    buildCategoryOptions(); updateSidebarCategories();
    await loadProducts();
    showToast('"'+name+'" kategorisi silindi.', 'success');
  } catch(err) {
    showToast('Kategori silinemedi: '+err.message, 'error');
  }
}

/* ════════════════════════════════════════
   GÖRSEL YÜKLEME — Cloudinary (öncelik) + Data URL fallback
════════════════════════════════════════ */
function switchImgTab(tab, el) {
  activeImgTab = tab;
  document.querySelectorAll('.img-tab-btn').forEach(function(b){ b.classList.remove('active'); });
  if (el) el.classList.add('active');
  document.querySelectorAll('.img-tab-pane').forEach(function(p){ p.classList.remove('active'); });
  document.getElementById('tab-'+tab).classList.add('active');
}

function isHeicFile(file) {
  var name = (file && file.name ? file.name : '').toLowerCase();
  var type = (file && file.type ? file.type : '').toLowerCase();
  return /\.(heic|heif)$/.test(name) || type === 'image/heic' || type === 'image/heif';
}

async function prepareImageFile(file) {
  if (!isHeicFile(file)) return file;
  if (typeof heic2any !== 'function') throw new Error('HEIC dönüştürücü yüklenemedi.');
  var converted = await heic2any({ blob:file, toType:'image/jpeg', quality:0.9 });
  var outBlob = Array.isArray(converted) ? converted[0] : converted;
  var safeName = (file.name || 'image').replace(/\.[^.]+$/, '') + '.jpg';
  return new File([outBlob], safeName, { type:'image/jpeg' });
}

function compressImage(file, maxWidth, quality) {
  maxWidth = maxWidth || 1600; quality = quality || 0.84;
  return new Promise(function(resolve, reject) {
    var reader = new FileReader();
    reader.onload = function(e) {
      var img = new Image();
      img.onload = function() {
        var canvas = document.createElement('canvas');
        var ratio  = Math.max(img.width, img.height) > maxWidth ? maxWidth / Math.max(img.width, img.height) : 1;
        canvas.width  = Math.round(img.width  * ratio);
        canvas.height = Math.round(img.height * ratio);
        var ctx = canvas.getContext('2d');
        ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        canvas.toBlob(function(blob){
          if (!blob) { reject(new Error('Sıkıştırma başarısız')); return; }
          resolve(blob);
        }, 'image/jpeg', quality);
      };
      img.onerror = reject;
      img.src = e.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function blobToDataURL(blob) {
  return new Promise(function(resolve, reject) {
    var reader = new FileReader();
    reader.onload = function(){ resolve(reader.result); };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

/* Cloudinary'e yükle ve URL döndür */
async function uploadToCloudinary(blob, filename) {
  var formData = new FormData();
  formData.append('file', blob, filename || 'image.jpg');
  formData.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);

  var res = await fetch(
    'https://api.cloudinary.com/v1_1/' + CLOUDINARY_CLOUD_NAME + '/image/upload',
    { method: 'POST', body: formData }
  );
  if (!res.ok) throw new Error('Cloudinary yükleme başarısız (HTTP ' + res.status + ')');
  var data = await res.json();
  if (data.error) throw new Error(data.error.message);
  return data.secure_url; // ✅ kalıcı HTTPS URL
}

function handleDragOver(e) {
  e.preventDefault();
  document.getElementById('file-drop-zone').classList.add('drag-over');
}
function handleDragLeave() {
  document.getElementById('file-drop-zone').classList.remove('drag-over');
}
function handleDrop(e) {
  e.preventDefault();
  document.getElementById('file-drop-zone').classList.remove('drag-over');
  var files = Array.from(e.dataTransfer.files).filter(function(f){ return (f.type||'').startsWith('image/') || isHeicFile(f); });
  if (files.length) uploadFiles(files);
  else showToast('Lütfen görsel dosyası seçin.', 'error');
}
function handleFileSelect(files) {
  if (!files || !files.length) return;
  uploadFiles(Array.from(files));
}

async function uploadFiles(files) {
  if (files.length + pendingImages.length > 4) {
    showToast('En fazla 4 görsel ekleyebilirsiniz.', 'error'); return;
  }

  var progress = document.getElementById('upload-progress');
  var bar      = document.getElementById('progress-bar-fill');
  var lbl      = document.getElementById('progress-label');
  progress.style.display = 'block';

  var useCloudinary = CLOUDINARY_CLOUD_NAME !== 'YOUR_CLOUD_NAME' && CLOUDINARY_UPLOAD_PRESET !== 'YOUR_PRESET';

  for (var i = 0; i < files.length; i++) {
    var file = files[i];
    if (file.size > 20 * 1024 * 1024) { showToast(file.name + ' 20MB\'dan büyük, atlandı.', 'error'); continue; }

    try {
      /* Adım 1 — HEIC dönüşümü */
      lbl.textContent = (i+1)+'/'+files.length+' hazırlanıyor…';
      setProgress(bar, 10);
      var normalized = await prepareImageFile(file);

      /* Adım 2 — Sıkıştırma */
      lbl.textContent = (i+1)+'/'+files.length+' optimize ediliyor…';
      setProgress(bar, 30);
      var quality    = normalized.size > 8 * 1024 * 1024 ? 0.66 : 0.76;
      var compressed = await compressImage(normalized, 1400, quality);

      var imageUrl;

      if (useCloudinary) {
        /* Adım 3a — Cloudinary'e yükle, URL al */
        lbl.textContent = (i+1)+'/'+files.length+' sunucuya yükleniyor…';
        setProgress(bar, 55);
        imageUrl = await uploadToCloudinary(compressed, normalized.name || 'image.jpg');
        setProgress(bar, 90);
        lbl.textContent = '✓ Cloudinary\'e yüklendi — URL alındı!';
      } else {
        /* Adım 3b — Cloudinary ayarlı değil, data URL kullan (fallback) */
        lbl.textContent = (i+1)+'/'+files.length+' URL\'e dönüştürülüyor…';
        setProgress(bar, 60);
        imageUrl = await blobToDataURL(compressed);
        if (imageUrl.length > 380000) {
          var tighter = await compressImage(normalized, 1000, 0.62);
          imageUrl    = await blobToDataURL(tighter);
        }
        lbl.textContent = '✓ Data URL olarak eklendi. (Cloudinary kurulu değil)';
      }

      setProgress(bar, 100);
      pendingImages.push({ url: imageUrl, source: useCloudinary ? 'cloudinary' : 'inline' });

    } catch(err) {
      console.error('Upload error:', err);
      showToast('Yükleme hatası: ' + err.message, 'error');
    }
  }

  renderImagePreviews();

  if (!pendingImages.length) showToast('Fotoğraf yüklenemedi.', 'error');
  setTimeout(function(){ progress.style.display = 'none'; setProgress(bar, 0); }, 2800);
}

function setProgress(bar, pct) {
  bar.style.width = pct + '%';
}

function addUrlImage() {
  var input = document.getElementById('p-img-url-single');
  var url   = (input.value || '').trim();
  if (!url) return;
  if (!url.startsWith('http')) { showToast('Geçerli bir URL girin (http ile başlamalı).', 'error'); return; }
  if (pendingImages.length >= 4) { showToast('En fazla 4 görsel ekleyebilirsiniz.', 'error'); return; }
  pendingImages.push({ url:url, source:'url' });
  input.value = '';
  renderImagePreviews();
  showToast('Görsel eklendi.', 'success');
}

function removeImage(idx) { pendingImages.splice(idx, 1); renderImagePreviews(); }

function moveImage(idx, dir) {
  var newIdx = idx + dir;
  if (newIdx < 0 || newIdx >= pendingImages.length) return;
  var temp = pendingImages[idx]; pendingImages[idx] = pendingImages[newIdx]; pendingImages[newIdx] = temp;
  renderImagePreviews();
}

function renderImagePreviews() {
  var container = document.getElementById('img-preview-grid');
  if (!pendingImages.length) {
    container.innerHTML = '<div class="img-placeholder"><i class="fa-regular fa-image"></i><span>Henüz görsel eklenmedi</span></div>';
    return;
  }
  container.innerHTML = pendingImages.map(function(img, i){
    return '<div class="img-thumb-wrap">' +
      '<img class="img-thumb" src="'+escHtml(img.url)+'" alt="" onerror="this.style.background=\'var(--surface-3)\'"/>' +
      (i === 0 ? '<span class="img-main-badge">ANA</span>' : '') +
      '<div class="img-thumb-overlay">' +
        (i > 0 ? '<button type="button" class="img-thumb-btn" onclick="moveImage('+i+',-1)" title="Sola"><i class="fa-solid fa-chevron-left"></i></button>' : '') +
        '<button type="button" class="img-thumb-btn red" onclick="removeImage('+i+')" title="Kaldır"><i class="fa-solid fa-trash"></i></button>' +
        (i < pendingImages.length-1 ? '<button type="button" class="img-thumb-btn" onclick="moveImage('+i+',1)" title="Sağa"><i class="fa-solid fa-chevron-right"></i></button>' : '') +
      '</div>' +
    '</div>';
  }).join('');
}

/* ════════════════════════════════════════
   NAVİGASYON
════════════════════════════════════════ */
var PANEL_TITLES = {
  'dashboard':   ['Dashboard',    'Genel Bakış'],
  'add-product': ['Ürün Ekle',    'Katalog'],
  'products':    ['Ürün Listesi', 'Katalog'],
  'orders':      ['Siparişler',   'Satış'],
};

function switchPanel(id, navEl) {
  document.querySelectorAll('.panel').forEach(function(p){ p.classList.remove('active'); });
  document.querySelectorAll('.nav-btn').forEach(function(n){ n.classList.remove('active'); });
  document.getElementById('panel-'+id).classList.add('active');
  if (navEl) navEl.classList.add('active');
  var t = PANEL_TITLES[id] || [id, id];
  document.getElementById('page-title').textContent         = t[0];
  document.getElementById('breadcrumb-current').textContent = t[1];
  currentPanel = id;
  if (window.innerWidth <= 900) document.getElementById('sidebar').classList.remove('open');
}

function toggleSidebar() { document.getElementById('sidebar').classList.toggle('open'); }

/* ════════════════════════════════════════
   FORM
════════════════════════════════════════ */
function setStock(val, el) {
  document.querySelectorAll('.toggle-opt').forEach(function(b){ b.classList.remove('active-green','active-red'); });
  el.classList.add(val === 'instock' ? 'active-green' : 'active-red');
  document.getElementById('p-stock') && (document.getElementById('p-stock').value = val);
}

function updateDiscountBadge() {
  var price     = parseFloat(document.getElementById('p-price').value) || 0;
  var salePrice = parseFloat(document.getElementById('p-sale-price').value) || 0;
  var strip = document.getElementById('discount-strip');
  if (salePrice > 0 && price > 0 && salePrice < price) {
    document.getElementById('preview-sale-price').textContent = fmt(salePrice);
    document.getElementById('preview-old-price').textContent  = fmt(price);
    document.getElementById('preview-pct').textContent        = '%'+Math.round((1 - salePrice/price)*100)+' tasarruf';
    strip.style.display = 'flex';
  } else {
    strip.style.display = 'none';
  }
}

function resetProductForm() {
  document.getElementById('product-form').reset();
  document.getElementById('p-edit-id').value = '';
  document.getElementById('discount-strip').style.display = 'none';
  var title = document.getElementById('form-panel-title');
  title.innerHTML = '<i class="fa-solid fa-plus"></i> Yeni Ürün Ekle';
  document.getElementById('submit-btn-label').textContent = 'Ürünü Kaydet';
  document.getElementById('new-cat-wrap').style.display   = 'none';
  document.getElementById('upload-progress').style.display = 'none';
  document.querySelectorAll('.toggle-opt').forEach(function(b){ b.classList.remove('active-green','active-red'); });
  var instock = document.querySelector('[data-value="instock"]');
  if (instock) setStock('instock', instock);
  pendingImages = [];
  renderImagePreviews();
}

async function handleProductSubmit(e) {
  e.preventDefault();
  var editId    = document.getElementById('p-edit-id').value;
  var name      = document.getElementById('p-name').value.trim();
  var category  = document.getElementById('p-category').value;
  var price     = parseFloat(document.getElementById('p-price').value) || 0;
  var salePrice = parseFloat(document.getElementById('p-sale-price').value) || 0;
  var stockEl   = document.querySelector('.toggle-opt.active-green, .toggle-opt.active-red');
  var stock     = stockEl ? stockEl.dataset.value : 'instock';
  var desc      = document.getElementById('p-desc').value.trim();

  if (!name || !category || price <= 0 || !desc) { showToast('Lütfen zorunlu alanları doldurun.', 'error'); return; }
  if (!pendingImages.length) { showToast('En az 1 görsel eklemelisiniz.', 'error'); return; }
  if (salePrice > 0 && salePrice >= price) { showToast('İndirimli fiyat, normal fiyattan küçük olmalı.', 'error'); return; }

  var btn = document.getElementById('submit-product-btn');
  btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Kaydediliyor…';
  btn.disabled  = true;

  var imageUrls = pendingImages.map(function(img){ return img.url; });
  var data = {
    name:name, category:category, price:price,
    salePrice:   salePrice > 0 ? salePrice : null,
    discountPct: (salePrice > 0 && price > 0) ? Math.round((1 - salePrice/price)*100) : null,
    stock:stock, description:desc,
    imageUrls:   imageUrls,
    imageUrl:    imageUrls[0] || '',
    updatedAt:   firebase.firestore.FieldValue.serverTimestamp(),
  };

  try {
    if (editId) {
      await db.collection('products').doc(editId).update(data);
      showToast('"'+name+'" güncellendi.', 'success');
    } else {
      data.createdAt = firebase.firestore.FieldValue.serverTimestamp();
      await db.collection('products').add(data);
      showToast('"'+name+'" eklendi.', 'success');
    }
    resetProductForm();
    await loadProducts(); loadDashboard();
    switchPanel('products', document.querySelector('[data-panel=products]'));
  } catch(err) {
    showToast('Hata: '+err.message, 'error');
  } finally {
    btn.innerHTML = '<i class="fa-solid fa-cloud-arrow-up"></i> <span id="submit-btn-label">Ürünü Kaydet</span>';
    btn.disabled  = false;
  }
}

function editProduct(id) {
  var p = allProducts.find(function(x){ return x.id === id; });
  if (!p) return;
  var d = p.data;
  document.getElementById('p-edit-id').value    = id;
  document.getElementById('p-name').value       = d.name || '';
  document.getElementById('p-price').value      = d.price || '';
  document.getElementById('p-sale-price').value = d.salePrice || '';
  document.getElementById('p-desc').value       = d.description || '';
  var titleEl = document.getElementById('form-panel-title');
  titleEl.innerHTML = '<i class="fa-solid fa-pen"></i> Ürün Düzenle';
  document.getElementById('submit-btn-label').textContent = 'Güncelle';

  if (d.category && !allCatNames().includes(d.category)) {
    allCategories.push({ id:'local', name:d.category }); buildCategoryOptions(); updateSidebarCategories();
  }
  document.getElementById('p-category').value = d.category || '';

  var sv  = d.stock || 'instock';
  var btn = document.querySelector('[data-value="'+sv+'"]');
  if (btn) setStock(sv, btn);

  updateDiscountBadge();

  var imgs = Array.isArray(d.imageUrls) && d.imageUrls.length > 0 ? d.imageUrls : (d.imageUrl ? [d.imageUrl] : []);
  pendingImages = imgs.map(function(url){ return { url:url, source:'url' }; });
  renderImagePreviews();

  switchPanel('add-product', document.querySelector('[data-panel=add-product]'));
}

function deleteProduct(id, name) {
  Swal.fire({
    title: '<span style="font-size:17px;font-weight:700;">"'+escHtml(name)+'" silinsin mi?</span>',
    html: '<div style="color:#8b9bb8;font-size:13px;">Bu ürün kalıcı olarak silinecek. Bu işlem geri alınamaz.</div>',
    icon: 'warning',
    showCancelButton: true,
    confirmButtonText: '<i class="fa-solid fa-trash"></i> Evet, Sil',
    cancelButtonText:  'Vazgeç',
    background: '#131825',
    color: '#e8edf6',
    confirmButtonColor: '#c0392b',
    cancelButtonColor:  '#1a2133',
    focusCancel: true,
  }).then(async function(result){
    if (!result.isConfirmed) return;
    try {
      await db.collection('products').doc(id).delete();
      showToast('"'+name+'" silindi.', 'success');
      await loadProducts(); loadDashboard();
    } catch(err) { showToast('Hata: '+err.message, 'error'); }
  });
}

/* ════════════════════════════════════════
   ÜRÜNLER
════════════════════════════════════════ */
async function loadProducts() {
  try {
    var snap = await db.collection('products').orderBy('createdAt','desc').get();
    allProducts = snap.docs.map(function(doc){ return {id:doc.id, data:doc.data()}; });
    renderProductsTable(allProducts);
    renderRecentProducts(allProducts.slice(0, 5));
    document.getElementById('nav-product-count').textContent = allProducts.length;
    updateProductCountLabel(allProducts.length);
  } catch(err) {
    document.getElementById('products-body').innerHTML =
      '<tr><td colspan="6" style="padding:32px;text-align:center;color:var(--red);">Hata: '+escHtml(err.message)+'</td></tr>';
  }
}

function updateProductCountLabel(count) {
  var el = document.getElementById('product-count-label');
  if (el) el.textContent = count + ' ürün bulundu';
}

function renderProductsTable(products) {
  var tbody = document.getElementById('products-body');
  updateProductCountLabel(products.length);
  if (!products.length) {
    tbody.innerHTML = '<tr><td colspan="6" style="padding:48px;text-align:center;color:var(--text-3);"><i class="fa-solid fa-box-open" style="font-size:28px;display:block;margin-bottom:10px;"></i>Ürün bulunamadı.</td></tr>';
    return;
  }
  tbody.innerHTML = products.map(function(item){
    var id = item.id, d = item.data;
    var imgs = Array.isArray(d.imageUrls) && d.imageUrls.length > 0 ? d.imageUrls : (d.imageUrl ? [d.imageUrl] : []);
    var thumbSrc = imgs[0] || '';
    var imgCount = imgs.length > 1 ? '<span class="ak-badge badge-gold" style="margin-left:4px;font-size:10px;">'+imgs.length+' foto</span>' : '';
    var fallback = "this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 44 44%22><rect width=%2244%22 height=%2244%22 fill=%22%2221252b%22/></svg>'";
    var saleBadge = d.salePrice
      ? '<span style="color:var(--gold);font-weight:700;">'+fmt(d.salePrice)+'</span> <span class="ak-badge badge-gold">%'+(d.discountPct||0)+' indirim</span>'
      : '<span style="color:var(--text-3);">—</span>';
    var stockBadge = d.stock === 'instock'
      ? '<span class="ak-badge badge-green"><i class="fa-solid fa-circle-dot"></i> Stokta</span>'
      : '<span class="ak-badge badge-red"><i class="fa-solid fa-ban"></i> Tükendi</span>';
    var sn = escHtml(d.name||'').replace(/'/g,"\\'");
    return '<tr>' +
      '<td><div class="product-cell"><img class="product-thumb" src="'+thumbSrc+'" alt="" onerror="'+fallback+'"/><div><div class="product-name">'+escHtml(d.name)+imgCount+'</div><div class="product-cat">'+escHtml(d.category||'—')+'</div></div></div></td>' +
      '<td><span class="ak-badge badge-gold">'+escHtml(d.category||'—')+'</span></td>' +
      '<td style="font-weight:600;">'+fmt(d.price)+'</td>' +
      '<td>'+saleBadge+'</td>' +
      '<td>'+stockBadge+'</td>' +
      '<td><div class="actions">' +
        '<button class="btn-ak btn-ak-sm" onclick="editProduct(\''+id+'\')" title="Düzenle"><i class="fa-solid fa-pen"></i> Düzenle</button>' +
        '<button class="btn-ak btn-ak-danger btn-ak-sm" onclick="deleteProduct(\''+id+'\',\''+sn+'\')" title="Sil"><i class="fa-solid fa-trash"></i></button>' +
      '</div></td>' +
    '</tr>';
  }).join('');
}

function renderRecentProducts(products) {
  var tbody = document.getElementById('recent-products-body');
  if (!products.length) {
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:32px;color:var(--text-3);">Ürün yok.</td></tr>';
    return;
  }
  tbody.innerHTML = products.map(function(item){
    var id = item.id, d = item.data;
    var imgs = Array.isArray(d.imageUrls) && d.imageUrls.length > 0 ? d.imageUrls : (d.imageUrl ? [d.imageUrl] : []);
    var sb = d.stock === 'instock'
      ? '<span class="ak-badge badge-green">Stokta</span>'
      : '<span class="ak-badge badge-red">Tükendi</span>';
    return '<tr>' +
      '<td><div class="product-cell"><img class="product-thumb" src="'+(imgs[0]||'')+'" alt="" onerror="this.style.background=\'var(--surface-3)\'"/><span class="product-name">'+escHtml(d.name)+'</span></div></td>' +
      '<td><span class="ak-badge badge-gold">'+escHtml(d.category||'—')+'</span></td>' +
      '<td style="font-weight:600;">'+fmt(d.price)+'</td>' +
      '<td>'+sb+'</td>' +
      '<td><button class="btn-ak btn-ak-sm" onclick="editProduct(\''+id+'\')"><i class="fa-solid fa-pen"></i> Düzenle</button></td>' +
    '</tr>';
  }).join('');
}

function filterProducts(q) {
  q = q.toLowerCase();
  renderProductsTable(allProducts.filter(function(item){
    var d = item.data;
    return (d.name||'').toLowerCase().includes(q) || (d.category||'').toLowerCase().includes(q);
  }));
}

function filterByCategory2(cat) {
  renderProductsTable(cat ? allProducts.filter(function(item){ return item.data.category === cat; }) : allProducts);
}

/* ════════════════════════════════════════
   SİPARİŞLER
════════════════════════════════════════ */
function loadOrders() {
  if (ordersUnsub) ordersUnsub();
  ordersUnsub = db.collection('orders').orderBy('createdAt','desc').onSnapshot(function(snap){
    allOrders = snap.docs.map(function(doc){ return {id:doc.id, data:doc.data()}; });
    renderOrdersTable(allOrders);
    document.getElementById('nav-order-count').textContent = allOrders.filter(function(o){ return o.data.status === 'pending' || !o.data.status; }).length;
    document.getElementById('stat-orders').textContent     = allOrders.length;
  }, function(err) {
    var body = document.getElementById('orders-body');
    if (body) body.innerHTML = '<tr><td colspan="7" style="padding:32px;text-align:center;color:var(--red);">Hata: '+escHtml(err.message)+'</td></tr>';
  });
}

function renderOrdersTable(orders) {
  var tbody = document.getElementById('orders-body');
  if (!tbody) return;
  if (!orders.length) { tbody.innerHTML = '<tr><td colspan="7" style="padding:40px;text-align:center;color:var(--text-3);">Sipariş yok.</td></tr>'; return; }
  var statusLabels = {
    pending:    '<span class="ak-badge badge-amber">Bekliyor</span>',
    processing: '<span class="ak-badge badge-blue">Hazırlanıyor</span>',
    shipped:    '<span class="ak-badge badge-green">Kargoda</span>',
    completed:  '<span class="ak-badge badge-green">Tamamlandı</span>',
    cancelled:  '<span class="ak-badge badge-red">İptal</span>',
  };
  tbody.innerHTML = orders.map(function(item){
    var id = item.id, d = item.data;
    var dateStr    = d.createdAt && d.createdAt.toDate ? d.createdAt.toDate().toLocaleDateString('tr-TR') : '—';
    var statusHtml = statusLabels[d.status||'pending'] || statusLabels.pending;
    var itemCount  = Array.isArray(d.items) ? d.items.reduce(function(s,i){ return s+(i.qty||1); }, 0) : '—';
    var custName   = (d.customer && d.customer.name) || '—';
    var custPhone  = (d.customer && d.customer.phone) || '';
    var targetPhone = normalizeTrPhone(custPhone) || WA_NUMBER;
    var waMsg = encodeURIComponent('Merhaba '+custName+', #'+id.slice(-8).toUpperCase()+' numaralı siparişinizle ilgili bilgi vermek istedik.');
    return '<tr>' +
      '<td><span class="order-num">#'+id.slice(-8).toUpperCase()+'</span></td>' +
      '<td><div style="font-weight:600;">'+escHtml(custName)+'</div><div style="font-size:11px;color:var(--text-2);">'+escHtml(custPhone)+'</div></td>' +
      '<td>'+itemCount+' ürün</td>' +
      '<td style="font-weight:700;color:var(--gold);">'+fmt(d.total)+'</td>' +
      '<td style="font-size:12px;color:var(--text-2);">'+dateStr+'</td>' +
      '<td>'+statusHtml+'</td>' +
      '<td><div class="actions">' +
        '<button class="btn-ak btn-ak-icon btn-ak-sm" onclick="showOrderDetail(\''+id+'\')" title="Detay"><i class="fa-solid fa-eye"></i></button>' +
        '<a href="https://wa.me/'+targetPhone+'?text='+waMsg+'" target="_blank" class="btn-ak btn-ak-icon btn-ak-sm btn-ak-success" title="WhatsApp\'ta Yaz"><i class="fa-brands fa-whatsapp"></i></a>' +
        '<select class="order-status-select" onchange="updateOrderStatus(\''+id+'\',this.value)">' +
          ['pending','processing','shipped','completed','cancelled'].map(function(s){
            return '<option value="'+s+'"'+(d.status===s?' selected':'')+'>'+{pending:'Bekliyor',processing:'Hazırlanıyor',shipped:'Kargoda',completed:'Tamamlandı',cancelled:'İptal'}[s]+'</option>';
          }).join('') +
        '</select>' +
        '<button class="btn-ak btn-ak-danger btn-ak-icon btn-ak-sm" onclick="deleteOrder(\''+id+'\',\''+id.slice(-8).toUpperCase()+'\')" title="Sil"><i class="fa-solid fa-trash"></i></button>' +
      '</div></td>' +
    '</tr>';
  }).join('');
}

async function updateOrderStatus(id, status) {
  try {
    await db.collection('orders').doc(id).update({ status:status, updatedAt:firebase.firestore.FieldValue.serverTimestamp() });
    showToast('Durum güncellendi.', 'success');
  } catch(err) { showToast('Hata: '+err.message, 'error'); }
}

function deleteOrder(id, orderNo) {
  Swal.fire({
    title: '<span style="font-size:17px;font-weight:700;">Sipariş #'+escHtml(orderNo)+' silinsin mi?</span>',
    html: '<div style="color:#8b9bb8;font-size:13px;">Bu sipariş kalıcı olarak silinecek.</div>',
    icon: 'warning',
    showCancelButton: true,
    confirmButtonText: '<i class="fa-solid fa-trash"></i> Evet, Sil',
    cancelButtonText:  'Vazgeç',
    background: '#131825', color: '#e8edf6',
    confirmButtonColor: '#c0392b', cancelButtonColor: '#1a2133',
    focusCancel: true,
  }).then(async function(result){
    if (!result.isConfirmed) return;
    try {
      await db.collection('orders').doc(id).delete();
      showToast('Sipariş silindi.', 'success');
    } catch(err) { showToast('Silme hatası: '+err.message, 'error'); }
  });
}

function showOrderDetail(id) {
  var order = allOrders.find(function(o){ return o.id === id; });
  if (!order) return;
  var d = order.data;
  var items = Array.isArray(d.items)
    ? d.items.map(function(item){ return '<div style="padding:4px 0;border-bottom:1px solid #1f2840;">'+escHtml(item.name)+' × '+item.qty+' = <b>'+fmt(item.price*item.qty)+'</b></div>'; }).join('')
    : '—';
  Swal.fire({
    title: 'Sipariş #'+id.slice(-8).toUpperCase(),
    html: '<div style="text-align:left;font-size:13px;color:#8b9bb8;">' +
      '<div style="margin-bottom:8px;"><b style="color:#e8edf6;">Müşteri:</b> '+escHtml((d.customer&&d.customer.name)||'—')+'</div>' +
      '<div style="margin-bottom:8px;"><b style="color:#e8edf6;">Telefon:</b> '+escHtml((d.customer&&d.customer.phone)||'—')+'</div>' +
      (d.customer&&d.customer.address ? '<div style="margin-bottom:12px;"><b style="color:#e8edf6;">Adres:</b> '+escHtml(d.customer.address)+'</div>' : '') +
      '<div style="margin-bottom:8px;">'+items+'</div>' +
      '<div style="margin-top:8px;font-size:14px;color:#d4a853;font-weight:700;">Toplam: '+fmt(d.total)+'</div>' +
    '</div>',
    background: '#131825', color: '#e8edf6',
    confirmButtonText: 'Tamam', confirmButtonColor: '#d4a853',
    customClass: { popup: 'swal-popup-custom' },
  });
}

/* ════════════════════════════════════════
   DASHBOARD
════════════════════════════════════════ */
function loadDashboard() {
  document.getElementById('stat-products').textContent = allProducts.length || '0';
  document.getElementById('stat-sale').textContent     = allProducts.filter(function(p){ return p.data.salePrice; }).length || '0';
  document.getElementById('stat-orders').textContent   = allOrders.length || '0';
}

/* ════════════════════════════════════════
   TOAST
════════════════════════════════════════ */
function showToast(msg, type) {
  type = type || 'info';
  var icons = { success:'fa-circle-check', error:'fa-circle-xmark', info:'fa-circle-info' };
  var root = document.getElementById('toast-container');
  var el   = document.createElement('div');
  el.className = 'toast-item toast-'+(type);
  el.innerHTML = '<i class="fa-solid '+(icons[type]||icons.info)+'"></i><span>'+escHtml(msg)+'</span>';
  root.appendChild(el);
  setTimeout(function(){ el.style.transition='opacity .3s'; el.style.opacity='0'; setTimeout(function(){ el.remove(); }, 320); }, 3500);
}

/* ════════════════════════════════════════
   UTILS
════════════════════════════════════════ */
function fmt(num){ return Number(num||0).toLocaleString('tr-TR',{style:'currency',currency:'TRY',minimumFractionDigits:2}); }
function escHtml(s){ return String(s!==null&&s!==undefined?s:'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;'); }
function escJs(s){ return String(s||'').replace(/\\/g,'\\\\').replace(/'/g,"\\'").replace(/"/g,'\\"'); }
function normalizeTrPhone(raw){
  var digits = String(raw||'').replace(/\D/g,'');
  if (!digits) return '';
  if (digits.length===11&&digits[0]==='0') return '90'+digits.slice(1);
  if (digits.length===10&&digits[0]==='5') return '90'+digits;
  if (digits.length===12&&digits.slice(0,2)==='90') return digits;
  return '';
}

/* ════════════════════════════════════════
   INIT
════════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', function(){
  var form = document.getElementById('product-form');
  if (form) form.addEventListener('submit', handleProductSubmit);

  var fi = document.getElementById('file-input');
  if (fi) fi.addEventListener('change', function(e){ handleFileSelect(e.target.files); });

  var dz = document.getElementById('file-drop-zone');
  if (dz) {
    dz.addEventListener('dragover', handleDragOver);
    dz.addEventListener('dragleave', handleDragLeave);
    dz.addEventListener('drop', handleDrop);
  }

  /* Stock toggle: varsayılan instock */
  var instockBtn = document.querySelector('[data-value="instock"]');
  if (instockBtn) setStock('instock', instockBtn);

  renderImagePreviews();
  switchPanel('dashboard', document.querySelector('.nav-btn[data-panel="dashboard"]'));

  /* SweetAlert2 global tema */
  document.head.insertAdjacentHTML('beforeend',
    '<style>' +
    '.swal2-popup { font-family: "DM Sans", sans-serif !important; border-radius: 16px !important; border: 1px solid #253044 !important; }' +
    '.swal2-confirm { border-radius: 10px !important; font-family: "DM Sans", sans-serif !important; font-weight: 700 !important; }' +
    '.swal2-cancel  { border-radius: 10px !important; font-family: "DM Sans", sans-serif !important; font-weight: 600 !important; border: 1px solid #253044 !important; }' +
    '.swal2-icon { border-color: #253044 !important; }' +
    '</style>'
  );
});
