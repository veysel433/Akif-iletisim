/* ================================================================
   AKİF İLETİŞİM — admin.js v6
   ✅ WhatsApp müşteri numarasına yönlendirildi
   ✅ Sipariş silme özelliği eklendi
   ✅ Storage hata mesajları iyileştirildi
   ================================================================ */

const firebaseConfig = {
  apiKey:            "AIzaSyA_qQBvQgAMON13EDSPTUNu58t0W4RD0FA",
  authDomain:        "akif-iletisim-gercekci.firebaseapp.com",
  projectId:         "akif-iletisim-gercekci",
  storageBucket:     "akif-iletisim-gercekci.firebasestorage.app",
  messagingSenderId: "527995566381",
  appId:             "1:527995566381:web:9ef6f0e8c37acbec89fba4",
  measurementId:     "G-D9WD7K857R",
};

firebase.initializeApp(firebaseConfig);
const auth    = firebase.auth();
const db      = firebase.firestore();
const storage = firebase.storage();

const WA_NUMBER = '905419705263'; // Admin WhatsApp (yedek)

/* ── STATE ── */
var allProducts   = [];
var allCategories = [];
var currentPanel  = 'dashboard';
var confirmCallback = null;
var activeImgTab  = 'file';
var pendingImages  = []; // {url, source:'url'|'file'}

var DEFAULT_CATS = ['Telefon','Tablet','Laptop','Aksesuar','Kulaklık','Saat','Tv & Ses Sistemi','Oyun','Diğer'];

/* ── AUTH ── */
auth.onAuthStateChanged(function(user) {
  if (user) {
    document.getElementById('auth-overlay').style.display  = 'none';
    document.getElementById('app').style.display = 'flex';
    var email = user.email || 'admin';
    document.getElementById('user-email-display').textContent = email;
    document.getElementById('user-initial').textContent = email[0].toUpperCase();
    initAdmin();
  } else {
    document.getElementById('auth-overlay').style.display = 'flex';
    document.getElementById('app').style.display = 'none';
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
  var errBox   = document.getElementById('auth-error');
  if (!email || !password) { showAuthError('E-posta ve şifre zorunludur.'); return; }
  btn.classList.add('loading'); errBox.style.display = 'none';
  try {
    await auth.signInWithEmailAndPassword(email, password);
  } catch(err) {
    btn.classList.remove('loading');
    var map = { 'auth/wrong-password':'Şifre hatalı.','auth/user-not-found':'Bu e-posta kayıtlı değil.','auth/invalid-credential':'E-posta veya şifre hatalı.','auth/too-many-requests':'Çok fazla deneme.' };
    showAuthError(map[err.code] || 'Giriş başarısız: ' + err.message);
  }
}
function showAuthError(msg) { var box = document.getElementById('auth-error'); document.getElementById('auth-error-text').textContent = msg; box.style.display = 'flex'; }
async function adminLogout() { await auth.signOut(); showToast('Çıkış yapıldı.','info'); }
function togglePw() { var inp = document.getElementById('login-password'); var ico = document.getElementById('pw-eye'); if (inp.type==='password'){ inp.type='text'; ico.className='fa-regular fa-eye-slash'; } else { inp.type='password'; ico.className='fa-regular fa-eye'; } }

/* ── KATEGORİ ── */
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
    return '<div class="nav-cat-item" onclick="switchPanel(\'products\',document.querySelector(\'[data-panel=products]\')); filterByCategory2(\''+escJs(cat)+'\')">'+escHtml(cat)+'</div>';
  }).join('');
}
function onCategoryChange(val) {
  if (val === '__new__') {
    document.getElementById('new-cat-wrap').classList.remove('hidden');
    document.getElementById('p-category').value = '';
    document.getElementById('new-cat-input').focus();
  } else { document.getElementById('new-cat-wrap').classList.add('hidden'); }
}
async function addCustomCategory() {
  var name = document.getElementById('new-cat-input').value.trim();
  if (!name) return;
  if (allCatNames().map(function(c){ return c.toLowerCase(); }).includes(name.toLowerCase())) { showToast('Bu kategori zaten mevcut.','error'); return; }
  try {
    var ref = await db.collection('categories').add({ name:name, createdAt:firebase.firestore.FieldValue.serverTimestamp() });
    allCategories.push({ id:ref.id, name:name });
    buildCategoryOptions(); updateSidebarCategories();
    document.getElementById('p-category').value = name;
    document.getElementById('new-cat-wrap').classList.add('hidden');
    document.getElementById('new-cat-input').value = '';
    showToast('"'+name+'" kategorisi eklendi.','success');
  } catch(err){ showToast('Kategori kaydedilemedi: '+err.message,'error'); }
}
function cancelNewCategory() { document.getElementById('new-cat-wrap').classList.add('hidden'); document.getElementById('p-category').value=''; document.getElementById('new-cat-input').value=''; }

/* ── GÖRSEL YÜKLEME — Firebase Storage ── */
function switchImgTab(tab, el) {
  activeImgTab = tab;
  document.querySelectorAll('.img-tab').forEach(function(b){ b.classList.remove('active'); });
  if (el) el.classList.add('active');
  document.querySelectorAll('.img-tab-content').forEach(function(c){ c.classList.remove('active'); });
  document.getElementById('tab-'+tab).classList.add('active');
}

function isHeicFile(file) {
  var name = (file && file.name ? file.name : '').toLowerCase();
  var type = (file && file.type ? file.type : '').toLowerCase();
  return /\.(heic|heif)$/.test(name) || type === 'image/heic' || type === 'image/heif';
}

async function prepareImageFile(file) {
  if (!isHeicFile(file)) return file;
  if (typeof heic2any !== 'function') {
    throw new Error('HEIC dönüştürücü yüklenemedi. Lütfen sayfayı yenileyin.');
  }
  var converted = await heic2any({ blob: file, toType: 'image/jpeg', quality: 0.9 });
  var outBlob = Array.isArray(converted) ? converted[0] : converted;
  var safeName = (file.name || 'image').replace(/\.[^.]+$/, '') + '.jpg';
  return new File([outBlob], safeName, { type: 'image/jpeg' });
}

function compressImage(file, maxWidth, quality) {
  maxWidth = maxWidth || 1600;
  quality  = quality  || 0.84;
  return new Promise(function(resolve, reject) {
    var reader = new FileReader();
    reader.onload = function(e) {
      var img = new Image();
      img.onload = function() {
        var canvas = document.createElement('canvas');
        var maxSide = Math.max(img.width, img.height);
        var ratio  = maxSide > maxWidth ? (maxWidth / maxSide) : 1;
        canvas.width  = Math.round(img.width  * ratio);
        canvas.height = Math.round(img.height * ratio);
        var ctx = canvas.getContext('2d');
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        canvas.toBlob(function(blob) {
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

function handleDragOver(e)  { e.preventDefault(); document.getElementById('file-drop-zone').classList.add('drag-over'); }
function handleDragLeave()  { document.getElementById('file-drop-zone').classList.remove('drag-over'); }
function handleDrop(e) {
  e.preventDefault();
  document.getElementById('file-drop-zone').classList.remove('drag-over');
  var files = Array.from(e.dataTransfer.files).filter(function(f){ return (f.type||'').startsWith('image/') || isHeicFile(f); });
  if (files.length) uploadFiles(files);
  else showToast('Lütfen görsel dosyası seçin.','error');
}
function handleFileSelect(files) {
  if (!files || !files.length) return;
  uploadFiles(Array.from(files));
}

async function uploadFiles(files) {
  if (files.length + pendingImages.length > 8) {
    showToast('En fazla 8 görsel ekleyebilirsiniz.','error'); return;
  }

  if (!storage) {
    showToast('Firebase Storage bağlantısı yok. URL ile ekleyin.','error'); return;
  }

  var progress = document.getElementById('upload-progress');
  var bar      = document.getElementById('progress-bar-fill');
  var lbl      = document.getElementById('progress-label');
  progress.style.display = 'block';
  bar.style.width = '5%';

  for (var i=0; i<files.length; i++) {
    var file = files[i];
    if (file.size > 20 * 1024 * 1024) { showToast(file.name + ' 20MB\'dan büyük, atlandı.','error'); continue; }
    try {
      lbl.textContent = (i+1)+'/'+files.length+' hazırlanıyor…';
      bar.style.width = '15%';

      var normalized = await prepareImageFile(file);
      var quality = normalized.size > (8 * 1024 * 1024) ? 0.78 : 0.84;
      var compressed = await compressImage(normalized, 1600, quality);

      lbl.textContent = (i+1)+'/'+files.length+' yükleniyor…';
      bar.style.width = '30%';

      var fileName = 'products/' + Date.now() + '_' + i + '_' + Math.random().toString(36).slice(2,7) + '.jpg';
      var storageRef = storage.ref().child(fileName);

      var uploadTask = storageRef.put(compressed, { contentType: 'image/jpeg' });

      var url = await new Promise(function(resolve, reject) {
        uploadTask.on('state_changed',
          function(snapshot) {
            var pct = Math.round(30 + (snapshot.bytesTransferred / snapshot.totalBytes) * 60);
            bar.style.width = pct + '%';
            lbl.textContent = (i+1)+'/'+files.length+' yükleniyor… %' + Math.round(snapshot.bytesTransferred/snapshot.totalBytes*100);
          },
          function(error) {
            reject(error);
          },
          async function() {
            try {
              var downloadURL = await uploadTask.snapshot.ref.getDownloadURL();
              resolve(downloadURL);
            } catch(e) { reject(e); }
          }
        );
      });

      pendingImages.push({ url: url, source: 'file' });
      bar.style.width = '100%';
      lbl.textContent = '✓ Yüklendi: ' + pendingImages.length + ' görsel';

    } catch(err) {
      console.error('Upload error:', err);
      if (err.code === 'storage/unauthorized' || err.message.includes('CORS') || err.message.includes('network')) {
        showToast('Depolama izni hatası. Firebase Console\'dan Storage kurallarını kontrol edin.','error');
      } else {
        showToast('Yükleme hatası: ' + err.message, 'error');
      }
    }
  }

  setTimeout(function(){ progress.style.display='none'; }, 2500);
  renderImagePreviews();
}

function addUrlImage() {
  var input = document.getElementById('p-img-url-single');
  var url   = (input.value||'').trim();
  if (!url) return;
  if (!url.startsWith('http')) { showToast('Geçerli bir URL girin (http ile başlamalı).','error'); return; }
  if (pendingImages.length >= 8) { showToast('En fazla 8 görsel ekleyebilirsiniz.','error'); return; }
  pendingImages.push({ url:url, source:'url' });
  input.value = '';
  renderImagePreviews();
  showToast('Görsel eklendi.','success');
}

function removeImage(idx) {
  pendingImages.splice(idx, 1);
  renderImagePreviews();
}

function moveImage(idx, dir) {
  var newIdx = idx + dir;
  if (newIdx < 0 || newIdx >= pendingImages.length) return;
  var temp = pendingImages[idx];
  pendingImages[idx] = pendingImages[newIdx];
  pendingImages[newIdx] = temp;
  renderImagePreviews();
}

function renderImagePreviews() {
  var container = document.getElementById('img-preview-grid');
  if (!pendingImages.length) {
    container.innerHTML = '<div class="img-placeholder"><i class="fa-regular fa-image"></i><span>Görsel eklenmedi</span></div>';
    return;
  }
  container.innerHTML = pendingImages.map(function(img, i){
    return '<div class="img-thumb-wrap">' +
      '<img class="img-thumb" src="'+escHtml(img.url)+'" alt="" onerror="this.style.background=\'var(--surface-3)\'" />' +
      '<button type="button" class="img-thumb-remove" onclick="removeImage('+i+')" title="Kaldır"><i class="fa-solid fa-xmark"></i></button>' +
      (i===0 ? '<span class="img-thumb-badge">Ana</span>' : '') +
      '<div class="img-thumb-nav">' +
        (i>0 ? '<button type="button" onclick="moveImage('+i+',-1)" title="Sola"><i class="fa-solid fa-chevron-left"></i></button>' : '') +
        (i<pendingImages.length-1 ? '<button type="button" onclick="moveImage('+i+',1)" title="Sağa"><i class="fa-solid fa-chevron-right"></i></button>' : '') +
      '</div>' +
    '</div>';
  }).join('');
}

/* ── NAVİGASYON ── */
var PANEL_TITLES = { 'dashboard':['Genel Bakış','Dashboard'],'add-product':['Ürün Ekle','Katalog'],'products':['Ürün Listesi','Katalog'],'orders':['Siparişler','Satış'] };
function switchPanel(id, navEl) {
  document.querySelectorAll('.panel').forEach(function(p){ p.classList.remove('active'); });
  document.querySelectorAll('.nav-item').forEach(function(n){ n.classList.remove('active'); });
  document.getElementById('panel-'+id).classList.add('active');
  if (navEl) navEl.classList.add('active');
  var t = PANEL_TITLES[id]||[id,id];
  document.getElementById('page-title').textContent         = t[0];
  document.getElementById('breadcrumb-current').textContent = t[1];
  currentPanel = id;
  if (window.innerWidth <= 768) document.getElementById('sidebar').classList.remove('open');
}
function toggleSidebar() { document.getElementById('sidebar').classList.toggle('open'); }
function refreshCurrentPanel() {
  if (currentPanel==='dashboard'){ loadDashboard(); loadProducts(); }
  if (currentPanel==='products')  loadProducts();
  if (currentPanel==='orders')    loadOrders();
  showToast('Yenilendi.','info');
}

/* ── FORM ── */
function setStock(val,el) {
  document.querySelectorAll('#stock-toggle .toggle-option').forEach(function(b){ b.classList.remove('active-green','active-red'); });
  el.classList.add(val==='instock'?'active-green':'active-red');
  document.getElementById('p-stock').value = val;
}
function updateDiscountBadge() {
  var price     = parseFloat(document.getElementById('p-price').value)||0;
  var salePrice = parseFloat(document.getElementById('p-sale-price').value)||0;
  var preview   = document.getElementById('discount-preview');
  if (salePrice>0&&price>0&&salePrice<price) {
    document.getElementById('preview-sale-price').textContent = fmt(salePrice);
    document.getElementById('preview-old-price').textContent  = fmt(price);
    document.getElementById('preview-pct').textContent        = '%'+Math.round((1-salePrice/price)*100)+' İndirim';
    preview.style.display='flex';
  } else { preview.style.display='none'; }
}

function resetProductForm() {
  document.getElementById('product-form').reset();
  document.getElementById('p-edit-id').value = '';
  document.getElementById('p-stock').value   = 'instock';
  document.getElementById('discount-preview').style.display  = 'none';
  document.getElementById('form-panel-title').textContent    = 'Yeni Ürün Ekle';
  document.getElementById('submit-btn-label').innerHTML      = '<i class="fa-solid fa-cloud-arrow-up"></i> Kaydet';
  document.getElementById('new-cat-wrap').classList.add('hidden');
  document.getElementById('upload-progress').style.display   = 'none';
  document.querySelectorAll('#stock-toggle .toggle-option').forEach(function(b){ b.classList.remove('active-green','active-red'); });
  document.querySelector('[data-value="instock"]').classList.add('active-green');
  pendingImages = [];
  renderImagePreviews();
}

async function handleProductSubmit(e) {
  e.preventDefault();
  var editId    = document.getElementById('p-edit-id').value;
  var name      = document.getElementById('p-name').value.trim();
  var category  = document.getElementById('p-category').value;
  var price     = parseFloat(document.getElementById('p-price').value)||0;
  var salePrice = parseFloat(document.getElementById('p-sale-price').value)||0;
  var stock     = document.getElementById('p-stock').value;
  var desc      = document.getElementById('p-desc').value.trim();

  if (!name||!category||price<=0||!desc) { showToast('Lütfen zorunlu alanları doldurun.','error'); return; }
  if (!pendingImages.length) { showToast('En az 1 görsel eklemelisiniz.','error'); return; }
  if (salePrice>0&&salePrice>=price) { showToast('İndirimli fiyat, normal fiyattan küçük olmalı.','error'); return; }

  var btn = document.getElementById('submit-product-btn');
  btn.classList.add('loading');

  var imageUrls = pendingImages.map(function(img){ return img.url; });
  var data = {
    name: name, category: category, price: price,
    salePrice:   salePrice>0 ? salePrice : null,
    discountPct: (salePrice>0&&price>0) ? Math.round((1-salePrice/price)*100) : null,
    stock: stock, description: desc,
    imageUrls:   imageUrls,
    imageUrl:    imageUrls[0]||'',
    updatedAt:   firebase.firestore.FieldValue.serverTimestamp(),
  };

  try {
    if (editId) {
      await db.collection('products').doc(editId).update(data);
      showToast('"'+name+'" güncellendi.','success');
    } else {
      data.createdAt = firebase.firestore.FieldValue.serverTimestamp();
      await db.collection('products').add(data);
      showToast('"'+name+'" eklendi.','success');
    }
    resetProductForm();
    await loadProducts(); await loadDashboard();
    switchPanel('products',document.querySelector('[data-panel=products]'));
  } catch(err) {
    showToast('Hata: '+err.message,'error');
  } finally { btn.classList.remove('loading'); }
}

function editProduct(id) {
  var p = allProducts.find(function(x){ return x.id===id; });
  if (!p) return;
  var d = p.data;
  document.getElementById('p-edit-id').value    = id;
  document.getElementById('p-name').value       = d.name||'';
  document.getElementById('p-price').value      = d.price||'';
  document.getElementById('p-sale-price').value = d.salePrice||'';
  document.getElementById('p-desc').value       = d.description||'';
  document.getElementById('form-panel-title').textContent = 'Ürün Düzenle';
  document.getElementById('submit-btn-label').innerHTML   = '<i class="fa-solid fa-floppy-disk"></i> Güncelle';
  if (d.category && !allCatNames().includes(d.category)) { allCategories.push({ id:'local', name:d.category }); buildCategoryOptions(); updateSidebarCategories(); }
  document.getElementById('p-category').value = d.category||'';
  var sv = d.stock||'instock';
  var sb = document.querySelector('[data-value="'+sv+'"]');
  if (sb) setStock(sv,sb);
  updateDiscountBadge();
  var imgs = Array.isArray(d.imageUrls)&&d.imageUrls.length>0 ? d.imageUrls : (d.imageUrl ? [d.imageUrl] : []);
  pendingImages = imgs.map(function(url){ return { url:url, source:'url' }; });
  renderImagePreviews();
  switchPanel('add-product',document.querySelector('[data-panel=add-product]'));
}

function deleteProduct(id,name) {
  openConfirm('"'+name+'" silinsin mi?','Bu ürün kalıcı olarak silinecek.',async function(){
    try { await db.collection('products').doc(id).delete(); showToast('"'+name+'" silindi.','success'); await loadProducts(); await loadDashboard(); }
    catch(err){ showToast('Hata: '+err.message,'error'); }
  });
}

/* ── ÜRÜNLER ── */
async function loadProducts() {
  try {
    var snap = await db.collection('products').orderBy('createdAt','desc').get();
    allProducts = snap.docs.map(function(doc){ return {id:doc.id,data:doc.data()}; });
    renderProductsTable(allProducts);
    renderRecentProducts(allProducts.slice(0,5));
    document.getElementById('nav-product-count').textContent = allProducts.length;
  } catch(err) {
    document.getElementById('products-body').innerHTML = '<tr><td colspan="6" style="padding:32px;text-align:center;color:var(--red);">Hata: '+escHtml(err.message)+'</td></tr>';
  }
}

function renderProductsTable(products) {
  var tbody = document.getElementById('products-body');
  if (!products.length){ tbody.innerHTML='<tr><td colspan="6" style="padding:48px;text-align:center;color:var(--text-3);"><i class="fa-solid fa-box-open" style="font-size:28px;display:block;margin-bottom:10px;"></i>Ürün bulunamadı.</td></tr>'; return; }
  tbody.innerHTML = products.map(function(item){
    var id=item.id, d=item.data;
    var imgs = Array.isArray(d.imageUrls)&&d.imageUrls.length>0 ? d.imageUrls : (d.imageUrl?[d.imageUrl]:[]);
    var thumbSrc = imgs[0]||'';
    var imgCount = imgs.length > 1 ? '<span class="badge badge-gold" style="margin-left:4px;">'+imgs.length+' foto</span>' : '';
    var fallback = "this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 44 44%22><rect width=%2244%22 height=%2244%22 fill=%22%2221252b%22/></svg>'";
    var saleBadge = d.salePrice?'<span style="color:var(--gold);font-weight:700;">'+fmt(d.salePrice)+'</span><span class="badge badge-gold" style="margin-left:4px;">%'+(d.discountPct||0)+'</span>':'<span style="color:var(--text-3);">—</span>';
    var stockBadge = d.stock==='instock'?'<span class="badge badge-green"><i class="fa-solid fa-circle-dot"></i> Stokta</span>':'<span class="badge badge-red"><i class="fa-solid fa-ban"></i> Tükendi</span>';
    var sn = escHtml(d.name||'').replace(/'/g,"\\'");
    return '<tr><td><div class="product-name-cell"><img class="product-thumb" src="'+thumbSrc+'" alt="" onerror="'+fallback+'" /><div><div class="name">'+escHtml(d.name)+imgCount+'</div><div class="cat">'+escHtml(d.category||'—')+'</div></div></div></td>'+
      '<td><span class="badge badge-gold">'+escHtml(d.category||'—')+'</span></td>'+
      '<td style="font-weight:600;">'+fmt(d.price)+'</td><td>'+saleBadge+'</td><td>'+stockBadge+'</td>'+
      '<td><div class="td-actions" style="justify-content:flex-end;">'+
        '<button class="btn btn-ghost btn-xs" onclick="editProduct(\''+id+'\')" title="Düzenle"><i class="fa-solid fa-pen"></i></button>'+
        '<button class="btn btn-danger btn-xs" onclick="deleteProduct(\''+id+'\',\''+sn+'\')" title="Sil"><i class="fa-solid fa-trash"></i></button>'+
      '</div></td></tr>';
  }).join('');
}

function renderRecentProducts(products) {
  var tbody = document.getElementById('recent-products-body');
  if (!products.length){ tbody.innerHTML='<tr><td colspan="5" style="text-align:center;padding:32px;color:var(--text-3);">Ürün yok.</td></tr>'; return; }
  tbody.innerHTML = products.map(function(item){
    var id=item.id,d=item.data;
    var imgs = Array.isArray(d.imageUrls)&&d.imageUrls.length>0 ? d.imageUrls : (d.imageUrl?[d.imageUrl]:[]);
    var sb=d.stock==='instock'?'<span class="badge badge-green">Stokta</span>':'<span class="badge badge-red">Tükendi</span>';
    return '<tr><td><div class="product-name-cell"><img class="product-thumb" src="'+(imgs[0]||'')+'" alt="" onerror="this.style.display=\'none\'" /><span class="name">'+escHtml(d.name)+'</span></div></td>'+
      '<td><span class="badge badge-gold">'+escHtml(d.category||'—')+'</span></td>'+
      '<td style="font-weight:600;">'+fmt(d.price)+'</td><td>'+sb+'</td>'+
      '<td><button class="btn btn-ghost btn-xs" onclick="editProduct(\''+id+'\')"><i class="fa-solid fa-pen"></i> Düzenle</button></td></tr>';
  }).join('');
}

function filterProducts(q){ q=q.toLowerCase(); renderProductsTable(allProducts.filter(function(item){ var d=item.data; return (d.name||'').toLowerCase().includes(q)||(d.category||'').toLowerCase().includes(q); })); }
function filterByCategory2(cat){ renderProductsTable(cat?allProducts.filter(function(item){return item.data.category===cat;}):allProducts); }

/* ── SİPARİŞLER ── */
var allOrders = [];
var ordersUnsub = null;
function loadOrders() {
  if (ordersUnsub) ordersUnsub();
  ordersUnsub = db.collection('orders').orderBy('createdAt','desc').onSnapshot(function(snap){
    allOrders = snap.docs.map(function(doc){ return {id:doc.id,data:doc.data()}; });
    renderOrdersTable(allOrders);
    document.getElementById('nav-order-count').textContent = allOrders.filter(function(o){ return o.data.status==='pending'||!o.data.status; }).length;
    document.getElementById('stat-orders').textContent     = allOrders.length;
  }, function(err){
    var body = document.getElementById('orders-body');
    if (body) body.innerHTML = '<tr><td colspan="8" style="padding:32px;text-align:center;color:var(--red);">Hata: '+escHtml(err.message)+'</td></tr>';
  });
}

function renderOrdersTable(orders) {
  var tbody = document.getElementById('orders-body');
  if (!tbody) return;
  if (!orders.length){ tbody.innerHTML='<tr><td colspan="8" style="padding:40px;text-align:center;color:var(--text-3);">Sipariş yok.</td></tr>'; return; }
  var statusLabels = { pending:'<span class="badge badge-amber">Bekliyor</span>', processing:'<span class="badge badge-gold">Hazırlanıyor</span>', shipped:'<span class="badge badge-green">Kargoda</span>', completed:'<span class="badge badge-green">Tamamlandı</span>', cancelled:'<span class="badge badge-red">İptal</span>' };
  tbody.innerHTML = orders.map(function(item){
    var id=item.id, d=item.data;
    var dateStr = d.createdAt&&d.createdAt.toDate ? d.createdAt.toDate().toLocaleDateString('tr-TR') : '—';
    var statusHtml = statusLabels[d.status||'pending'] || '<span class="badge badge-amber">Bekliyor</span>';
    var itemCount  = Array.isArray(d.items) ? d.items.reduce(function(s,i){ return s+(i.qty||1); },0) : '—';
    var custName   = (d.customer&&d.customer.name)||'—';
    var custPhone  = (d.customer&&d.customer.phone)||'';
    // WhatsApp linki müşteri numarasına, geçersizse admin numarasına
    var targetPhone = normalizeTrPhone(custPhone) || WA_NUMBER;
    var waMsg = encodeURIComponent('Merhaba '+custName+', #'+id.slice(-8).toUpperCase()+' numaralı siparişinizle ilgili bilgi vermek istedik.');
    return '<tr>'+
      '<td style="font-size:11px;font-weight:600;font-family:monospace;">#'+id.slice(-8).toUpperCase()+'</td>'+
      '<td><div style="font-weight:600;">'+escHtml(custName)+'</div><div style="font-size:11px;color:var(--text-2);">'+escHtml(custPhone)+'</div></td>'+
      '<td>'+itemCount+' ürün</td>'+
      '<td style="font-weight:700;color:var(--gold);">'+fmt(d.total)+'</td>'+
      '<td><span style="font-size:11px;color:var(--text-2);">WhatsApp</span></td>'+
      '<td>'+statusHtml+'</td>'+
      '<td><div class="td-actions" style="justify-content:flex-end;gap:5px;">'+
        '<button class="btn btn-ghost btn-xs" onclick="showOrderDetail(\''+id+'\')" title="Detay"><i class="fa-solid fa-eye"></i></button>'+
        '<a href="https://wa.me/'+targetPhone+'?text='+waMsg+'" target="_blank" class="btn btn-ghost btn-xs" title="WhatsApp\'ta Yaz" style="color:#25d366;"><i class="fa-brands fa-whatsapp"></i></a>'+
        '<div class="select-wrap" style="min-width:110px;">'+
          '<select class="form-select" style="padding:5px 28px 5px 8px;font-size:11px;" onchange="updateOrderStatus(\''+id+'\',this.value)">'+
            '<option value="pending" '+(d.status==='pending'?'selected':'')+'>Bekliyor</option>'+
            '<option value="processing" '+(d.status==='processing'?'selected':'')+'>Hazırlanıyor</option>'+
            '<option value="shipped" '+(d.status==='shipped'?'selected':'')+'>Kargoda</option>'+
            '<option value="completed" '+(d.status==='completed'?'selected':'')+'>Tamamlandı</option>'+
            '<option value="cancelled" '+(d.status==='cancelled'?'selected':'')+'>İptal</option>'+
          '</select>'+
        '</div>'+
        '<button class="btn btn-danger btn-xs" onclick="deleteOrder(\''+id+'\',\''+id.slice(-8).toUpperCase()+'\')" title="Siparişi Sil"><i class="fa-solid fa-trash"></i></button>'+
      '</div></td>'+
    '</tr>';
  }).join('');
}

async function updateOrderStatus(id, status) {
  try {
    await db.collection('orders').doc(id).update({ status:status, updatedAt:firebase.firestore.FieldValue.serverTimestamp() });
    showToast('Durum güncellendi.','success');
  } catch(err){ showToast('Hata: '+err.message,'error'); }
}

function deleteOrder(id, orderNo) {
  openConfirm('Sipariş #'+orderNo+' silinsin mi?','Bu sipariş kalıcı olarak silinecek.', async function(){
    try {
      await db.collection('orders').doc(id).delete();
      showToast('Sipariş silindi.','success');
    } catch(err) {
      showToast('Silme hatası: '+err.message,'error');
    }
  });
}

function showOrderDetail(id) {
  var order = allOrders.find(function(o){ return o.id===id; });
  if (!order) return;
  var d = order.data;
  var items = Array.isArray(d.items) ? d.items.map(function(item){ return '• '+item.name+' × '+item.qty+' = '+fmt(item.price*item.qty); }).join('\n') : '—';
  var addr = d.customer&&d.customer.address ? '\nAdres: '+d.customer.address : '';
  openConfirm(
    'Sipariş #'+id.slice(-8).toUpperCase(),
    'Müşteri: '+(d.customer&&d.customer.name||'—')+'\nTel: '+(d.customer&&d.customer.phone||'—')+addr+'\n\n'+items+'\n\nToplam: '+fmt(d.total)+'\nDurum: '+(d.status||'pending'),
    function(){}
  );
  document.getElementById('confirm-ok-btn').textContent = 'Tamam';
  document.getElementById('confirm-icon').querySelector('i').className = 'fa-solid fa-receipt';
}

/* ── DASHBOARD ── */
async function loadDashboard() {
  document.getElementById('stat-products').textContent = allProducts.length||'0';
  document.getElementById('stat-sale').textContent     = allProducts.filter(function(p){ return p.data.salePrice; }).length||'0';
  document.getElementById('stat-orders').textContent   = allOrders.length||'0';
}

/* ── CONFIRM ── */
function openConfirm(title,desc,onConfirm) {
  document.getElementById('confirm-title').textContent=title;
  document.getElementById('confirm-desc').style.whiteSpace='pre-line';
  document.getElementById('confirm-desc').textContent=desc;
  document.getElementById('confirm-overlay').classList.add('open');
  confirmCallback=onConfirm;
  document.getElementById('confirm-ok-btn').onclick=function(){
    // Callback closeConfirm içinde null'landığı için önce yakalıyoruz.
    var cb = confirmCallback;
    closeConfirm();
    if (cb) cb();
  };
}
function closeConfirm(){ document.getElementById('confirm-overlay').classList.remove('open'); confirmCallback=null; }
document.getElementById('confirm-overlay').addEventListener('click',function(e){ if(e.target===this) closeConfirm(); });

/* ── TOAST ── */
function showToast(msg,type) {
  type=type||'info';
  var icons={success:'fa-circle-check',error:'fa-circle-xmark',info:'fa-circle-info'};
  var root=document.getElementById('toast-container');
  var el=document.createElement('div');
  el.className='toast toast-'+type;
  el.innerHTML='<i class="fa-solid '+(icons[type]||icons.info)+'"></i><span>'+escHtml(msg)+'</span>';
  root.appendChild(el);
  setTimeout(function(){ el.style.transition='opacity .3s';el.style.opacity='0';setTimeout(function(){el.remove();},320); },3500);
}

/* ── UTILS ── */
function fmt(num){ return Number(num||0).toLocaleString('tr-TR',{style:'currency',currency:'TRY',minimumFractionDigits:2}); }
function escHtml(s){ return String(s!==null&&s!==undefined?s:'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;'); }
function normalizeTrPhone(raw){
  var digits = String(raw||'').replace(/\D/g,'');
  if (!digits) return '';
  if (digits.length===11 && digits[0]==='0') return '90'+digits.slice(1);
  if (digits.length===10 && digits[0]==='5') return '90'+digits;
  if (digits.length===12 && digits.slice(0,2)==='90') return digits;
  return '';
}
function escJs(s){ return String(s||'').replace(/\\/g,'\\\\').replace(/'/g,"\\'").replace(/"/g,'\\"'); }
/* ── INIT ── */
document.addEventListener('DOMContentLoaded', function(){
  var form = document.getElementById('product-form');
  if (form) form.addEventListener('submit', handleProductSubmit);

  var pPrice = document.getElementById('p-price');
  var pSale  = document.getElementById('p-sale-price');
  if (pPrice) pPrice.addEventListener('input', updateDiscountBadge);
  if (pSale)  pSale.addEventListener('input', updateDiscountBadge);

  var fi = document.getElementById('file-input');
  if (fi) fi.addEventListener('change', function(e){ handleFileSelect(e.target.files); });

  var dz = document.getElementById('file-drop-zone');
  if (dz) {
    dz.addEventListener('dragover', handleDragOver);
    dz.addEventListener('dragleave', handleDragLeave);
    dz.addEventListener('drop', handleDrop);
  }

  var sidebarBtn = document.getElementById('sidebar-toggle');
  if (sidebarBtn) sidebarBtn.addEventListener('click', toggleSidebar);
  var sidebarMainBtn = document.getElementById('sidebar-toggle-main');
  if (sidebarMainBtn) sidebarMainBtn.addEventListener('click', toggleSidebar);

  var stockBtn = document.querySelector('[data-value="instock"]');
  if (stockBtn) setStock('instock', stockBtn);

  renderImagePreviews();
  switchPanel('dashboard', document.querySelector('.nav-item[data-panel="dashboard"]'));
});
