/* ================================================================
   🔥 AKİF İLETİŞİM — admin.js v3
   ✅ Firebase Storage ile dosya yükleme
   ✅ Kategoriler Firestore'a kaydedilir → sidebar otomatik güncellenir
   ✅ Dashboard istatistik widgetları
   ✅ Yorum onayla + sonradan sil
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

/* ── STATE ── */
var allProducts   = [];
var allComments   = [];
var allCategories = []; // Firestore'dan çekilen kategoriler
var commentFilter = 'all';
var currentPanel  = 'dashboard';
var confirmCallback = null;
var activeImgTab  = 'url'; // 'url' | 'file'
var uploadedImageUrl = ''; // Yüklenen dosyanın Storage URL'i

var DEFAULT_CATS = ['Telefon','Tablet','Laptop','Aksesuar','Kulaklık','Saat','Tv & Ses Sistemi','Oyun','Diğer'];

/* ── AUTH ── */
auth.onAuthStateChanged(function(user) {
  if (user) {
    document.getElementById('auth-overlay').style.display  = 'none';
    document.getElementById('app').style.display = 'flex';
    var email = user.email || 'admin';
    document.getElementById('user-email-display').textContent = email;
    document.getElementById('user-initial').textContent = email[0].toUpperCase();
    if (window.innerWidth <= 768) document.getElementById('sidebar-toggle').style.display = 'flex';
    initAdmin();
  } else {
    document.getElementById('auth-overlay').style.display = 'flex';
    document.getElementById('app').style.display = 'none';
  }
});

async function initAdmin() {
  await loadCategories(); // önce kategorileri çek
  loadDashboard();
  loadProducts();
  loadComments();
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

/* ── KATEGORİ YÖNETİMİ (Firestore tabanlı) ── */
async function loadCategories() {
  try {
    var snap = await db.collection('categories').orderBy('order').get();
    allCategories = snap.docs.map(function(doc){ return { id:doc.id, name:doc.data().name }; });
  } catch(e) {
    // order alanı yoksa sırasız çek
    try {
      var snap2 = await db.collection('categories').get();
      allCategories = snap2.docs.map(function(doc){ return { id:doc.id, name:doc.data().name }; });
    } catch(e2) { allCategories = []; }
  }
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
  var sel   = document.getElementById('p-category');
  var fsel  = document.getElementById('cat-filter-select');
  var names = allCatNames();

  var html = '<option value="">Seçiniz…</option>';
  names.forEach(function(c){ html += '<option value="'+escHtml(c)+'">'+escHtml(c)+'</option>'; });
  html += '<option value="__new__">+ Yeni Kategori Ekle…</option>';
  if (sel) sel.innerHTML = html;

  if (fsel) {
    var fhtml = '<option value="">Tüm Kategoriler</option>';
    names.forEach(function(c){ fhtml += '<option value="'+escHtml(c)+'">'+escHtml(c)+'</option>'; });
    fsel.innerHTML = fhtml;
  }
}

/* Sidebar kategori listesini güncelle — admin eklediğinde anında yansır */
function updateSidebarCategories() {
  var list  = document.getElementById('nav-cat-list');
  var names = allCatNames();
  list.innerHTML = names.map(function(cat){
    return '<div class="nav-cat-item" onclick="switchPanel(\'products\',document.querySelector(\'[data-panel=products]\'));filterByCategory2(\''+escJs(cat)+'\')">'+escHtml(cat)+'</div>';
  }).join('');
}

function onCategoryChange(val) {
  if (val === '__new__') {
    document.getElementById('new-cat-wrap').classList.add('visible');
    document.getElementById('p-category').value = '';
    document.getElementById('new-cat-input').focus();
  } else {
    document.getElementById('new-cat-wrap').classList.remove('visible');
  }
}

async function addCustomCategory() {
  var name = document.getElementById('new-cat-input').value.trim();
  if (!name) return;
  if (allCatNames().map(function(c){ return c.toLowerCase(); }).includes(name.toLowerCase())) {
    showToast('Bu kategori zaten mevcut.','error'); return;
  }
  try {
    // Firestore'a kaydet — hem admin hem index.html okuyabilir
    var ref = await db.collection('categories').add({ name:name, order: allCategories.length + DEFAULT_CATS.length, createdAt: firebase.firestore.FieldValue.serverTimestamp() });
    allCategories.push({ id: ref.id, name: name });
    buildCategoryOptions();
    updateSidebarCategories(); // sidebar anında güncellenir
    document.getElementById('p-category').value = name;
    document.getElementById('new-cat-wrap').classList.remove('visible');
    document.getElementById('new-cat-input').value = '';
    showToast('"'+name+'" kategorisi eklendi ve sidebar güncellendi.','success');
  } catch(err) {
    showToast('Kategori kaydedilemedi: '+err.message,'error');
  }
}

function cancelNewCategory() {
  document.getElementById('new-cat-wrap').classList.remove('visible');
  document.getElementById('new-cat-input').value = '';
  document.getElementById('p-category').value = '';
}

/* ── GÖRSEL YÜKLEME ── */
function switchImgTab(tab, el) {
  activeImgTab = tab;
  document.querySelectorAll('.img-tab').forEach(function(b){ b.classList.remove('active'); });
  el.classList.add('active');
  document.querySelectorAll('.img-tab-content').forEach(function(c){ c.classList.remove('active'); });
  document.getElementById('tab-'+tab).classList.add('active');
  /* URL tab'ına dönünce dosya URL'ini temizle */
  if (tab === 'url') { uploadedImageUrl = ''; document.getElementById('p-img-final').value = ''; }
}

function previewImageFromUrl(url) {
  document.getElementById('p-img-final').value = url;
  previewImage(url);
}

function previewImage(url) {
  var img = document.getElementById('img-preview-img');
  var ph  = document.getElementById('img-preview').querySelector('.placeholder');
  if (!url) { img.style.display='none'; ph.style.display='flex'; return; }
  img.onload  = function(){ img.style.display='block'; ph.style.display='none'; };
  img.onerror = function(){ img.style.display='none';  ph.style.display='flex'; };
  img.src = url;
}

/* Dosya seçme / sürükleme */
function handleFileSelect(file) {
  if (!file) return;
  if (file.size > 5 * 1024 * 1024) { showToast('Dosya 5MB\'dan büyük olamaz.','error'); return; }
  uploadFile(file);
}

function handleDragOver(e) { e.preventDefault(); document.getElementById('file-drop-zone').classList.add('drag-over'); }
function handleDragLeave(e) { document.getElementById('file-drop-zone').classList.remove('drag-over'); }
function handleDrop(e) {
  e.preventDefault();
  document.getElementById('file-drop-zone').classList.remove('drag-over');
  var file = e.dataTransfer.files[0];
  if (file && file.type.startsWith('image/')) uploadFile(file);
  else showToast('Lütfen bir görsel dosyası seçin.','error');
}

async function uploadFile(file) {
  var progressWrap = document.getElementById('upload-progress');
  var progressBar  = document.getElementById('progress-bar-fill');
  var progressLbl  = document.getElementById('progress-label');

  progressWrap.style.display = 'block';
  progressBar.style.width    = '0%';
  progressLbl.textContent    = 'Yükleniyor…';

  try {
    var fileName = 'products/' + Date.now() + '_' + file.name.replace(/[^a-z0-9.]/gi,'_');
    var ref = storage.ref().child(fileName);
    var uploadTask = ref.put(file);

    uploadTask.on('state_changed',
      function(snapshot) {
        var pct = Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100);
        progressBar.style.width = pct + '%';
        progressLbl.textContent = pct + '% yüklendi…';
      },
      function(err) {
        progressWrap.style.display = 'none';
        showToast('Yükleme hatası: ' + err.message, 'error');
      },
      async function() {
        var url = await uploadTask.snapshot.ref.getDownloadURL();
        uploadedImageUrl = url;
        document.getElementById('p-img-final').value = url;
        progressBar.style.width = '100%';
        progressLbl.textContent = '✓ Yükleme tamamlandı';
        previewImage(url);
        setTimeout(function(){ progressWrap.style.display='none'; }, 1500);
        showToast('Görsel başarıyla yüklendi.','success');
      }
    );
  } catch(err) {
    progressWrap.style.display = 'none';
    showToast('Yükleme başarısız: ' + err.message,'error');
  }
}

/* ── NAVİGASYON ── */
var PANEL_TITLES = { 'dashboard':['Genel Bakış','Dashboard'],'add-product':['Ürün Ekle','Katalog'],'products':['Ürün Listesi','Katalog'],'comments':['Yorum Moderasyonu','Topluluk'] };
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
  if (currentPanel==='comments')  loadComments();
  showToast('Yenilendi.','info');
}

/* ── ÜRÜN FORMU ── */
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
    document.getElementById('preview-sale-price').textContent = formatPrice(salePrice);
    document.getElementById('preview-old-price').textContent  = formatPrice(price);
    document.getElementById('preview-pct').textContent        = '%'+Math.round((1-salePrice/price)*100)+' İndirim';
    preview.style.display='flex';
  } else { preview.style.display='none'; }
}
function resetProductForm() {
  document.getElementById('product-form').reset();
  document.getElementById('p-edit-id').value  = '';
  document.getElementById('p-stock').value    = 'instock';
  document.getElementById('p-img-final').value= '';
  uploadedImageUrl = '';
  document.getElementById('img-preview-img').style.display = 'none';
  document.getElementById('img-preview').querySelector('.placeholder').style.display = 'flex';
  document.getElementById('discount-preview').style.display  = 'none';
  document.getElementById('form-panel-title').textContent    = 'Yeni Ürün Ekle';
  document.getElementById('submit-btn-label').innerHTML      = '<i class="fa-solid fa-cloud-arrow-up"></i> Kaydet';
  document.getElementById('new-cat-wrap').classList.remove('visible');
  document.getElementById('upload-progress').style.display   = 'none';
  document.querySelectorAll('#stock-toggle .toggle-option').forEach(function(b){ b.classList.remove('active-green','active-red'); });
  document.querySelector('[data-value="instock"]').classList.add('active-green');
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
  /* Görsel: URL tab veya yüklenen dosya */
  var imgUrl = activeImgTab==='url'
    ? (document.getElementById('p-img').value||'').trim()
    : document.getElementById('p-img-final').value;

  if (!name||!category||price<=0||!desc||!imgUrl){ showToast('Lütfen zorunlu alanları doldurun.','error'); return; }
  if (salePrice>0&&salePrice>=price){ showToast('İndirimli fiyat, normal fiyattan küçük olmalı.','error'); return; }

  var btn = document.getElementById('submit-product-btn');
  btn.classList.add('loading');
  var data = { name,category,price, salePrice:salePrice>0?salePrice:null, discountPct:(salePrice>0&&price>0)?Math.round((1-salePrice/price)*100):null, stock, description:desc, imageUrl:imgUrl, updatedAt:firebase.firestore.FieldValue.serverTimestamp() };
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
    await loadProducts();
    await loadDashboard();
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
  document.getElementById('p-img').value        = d.imageUrl||'';
  document.getElementById('p-img-final').value  = d.imageUrl||'';
  document.getElementById('form-panel-title').textContent = 'Ürün Düzenle';
  document.getElementById('submit-btn-label').innerHTML   = '<i class="fa-solid fa-floppy-disk"></i> Değişiklikleri Kaydet';
  if (d.category && !allCatNames().includes(d.category)) {
    allCategories.push({ id:'local_'+Date.now(), name:d.category });
    buildCategoryOptions(); updateSidebarCategories();
  }
  document.getElementById('p-category').value = d.category||'';
  var sv = d.stock||'instock';
  var sb = document.querySelector('[data-value="'+sv+'"]');
  if (sb) setStock(sv,sb);
  previewImage(d.imageUrl||'');
  updateDiscountBadge();
  /* URL tab'a geç */
  switchImgTab('url', document.querySelector('.img-tab'));
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
  if (!products.length){ tbody.innerHTML='<tr><td colspan="6" style="padding:48px;text-align:center;color:var(--text-3);"><i class="fa-solid fa-box-open" style="font-size:28px;margin-bottom:10px;display:block;"></i>Ürün bulunamadı.</td></tr>'; return; }
  tbody.innerHTML=products.map(function(item){
    var id=item.id,d=item.data;
    var fallback="this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 44 44%22><rect width=%2244%22 height=%2244%22 fill=%22%2221252b%22/></svg>'";
    var saleBadge=d.salePrice?'<span style="color:var(--gold);font-weight:700;">'+formatPrice(d.salePrice)+'</span><span class="badge badge-gold" style="margin-left:4px;">%'+(d.discountPct||0)+'</span>':'<span style="color:var(--text-3);">—</span>';
    var stockBadge=d.stock==='instock'?'<span class="badge badge-green"><i class="fa-solid fa-circle-dot"></i> Stokta</span>':'<span class="badge badge-red"><i class="fa-solid fa-ban"></i> Tükendi</span>';
    var sn=escHtml(d.name||'').replace(/'/g,"\\'");
    return '<tr><td><div class="product-name-cell"><img class="product-thumb" src="'+escHtml(d.imageUrl||'')+'" alt="" onerror="'+fallback+'" /><div><div class="name">'+escHtml(d.name)+'</div><div class="cat">'+escHtml(d.category||'—')+'</div></div></div></td>'+
      '<td><span class="badge badge-gold">'+escHtml(d.category||'—')+'</span></td>'+
      '<td style="font-weight:600;">'+formatPrice(d.price)+'</td>'+
      '<td>'+saleBadge+'</td><td>'+stockBadge+'</td>'+
      '<td><div class="td-actions" style="justify-content:flex-end;">'+
        '<button class="btn btn-ghost btn-xs" onclick="editProduct(\''+id+'\')" title="Düzenle"><i class="fa-solid fa-pen"></i></button>'+
        '<button class="btn btn-danger btn-xs" onclick="deleteProduct(\''+id+'\',\''+sn+'\')" title="Sil"><i class="fa-solid fa-trash"></i></button>'+
      '</div></td></tr>';
  }).join('');
}

function renderRecentProducts(products) {
  var tbody=document.getElementById('recent-products-body');
  if (!products.length){ tbody.innerHTML='<tr><td colspan="5" style="padding:32px;text-align:center;color:var(--text-3);">Ürün yok.</td></tr>'; return; }
  tbody.innerHTML=products.map(function(item){
    var id=item.id,d=item.data;
    var sb=d.stock==='instock'?'<span class="badge badge-green">Stokta</span>':'<span class="badge badge-red">Tükendi</span>';
    return '<tr><td><div class="product-name-cell"><img class="product-thumb" src="'+escHtml(d.imageUrl||'')+'" alt="" onerror="this.style.display=\'none\'" /><span class="name">'+escHtml(d.name)+'</span></div></td>'+
      '<td><span class="badge badge-gold">'+escHtml(d.category||'—')+'</span></td>'+
      '<td style="font-weight:600;">'+formatPrice(d.price)+'</td>'+
      '<td>'+sb+'</td>'+
      '<td><button class="btn btn-ghost btn-xs" onclick="editProduct(\''+id+'\')"><i class="fa-solid fa-pen"></i> Düzenle</button></td></tr>';
  }).join('');
}
function filterProducts(q){ q=q.toLowerCase(); renderProductsTable(allProducts.filter(function(item){ var d=item.data; return (d.name||'').toLowerCase().includes(q)||(d.category||'').toLowerCase().includes(q)||(d.description||'').toLowerCase().includes(q); })); }
function filterByCategory2(cat){ renderProductsTable(cat?allProducts.filter(function(item){return item.data.category===cat;}):allProducts); }

/* ── YORUMLAR ── */
async function loadComments() {
  try {
    var snap=await db.collection('comments').orderBy('createdAt','desc').get();
    allComments=snap.docs.map(function(doc){return {id:doc.id,data:doc.data()};});
    var pending =allComments.filter(function(c){return c.data.status==='pending';}).length;
    var approved=allComments.filter(function(c){return c.data.status==='approved';}).length;
    document.getElementById('nav-comment-count').textContent=allComments.length;
    document.getElementById('stat-pending').textContent=pending;
    document.getElementById('stat-approved').textContent=approved;
    renderComments(allComments,commentFilter);
  } catch(err) {
    document.getElementById('comment-list').innerHTML='<div style="text-align:center;padding:32px;color:var(--red);">Hata: '+escHtml(err.message)+'</div>';
  }
}

function renderComments(comments,filter) {
  filter=filter||'all';
  var list=document.getElementById('comment-list');
  var filtered=filter==='all'?comments:comments.filter(function(c){return c.data.status===filter;});
  if (!filtered.length) {
    var msg=filter==='pending'?'Bekleyen yorum yok.':filter==='approved'?'Onaylı yorum yok.':'Henüz yorum yok.';
    list.innerHTML='<div style="text-align:center;padding:48px;color:var(--text-3);"><i class="fa-solid fa-comment-slash" style="font-size:28px;margin-bottom:12px;display:block;"></i>'+msg+'</div>';
    return;
  }
  list.innerHTML=filtered.map(function(item,i){
    var id=item.id,c=item.data;
    var initials=(c.author||'K').slice(0,2).toUpperCase();
    var stars=''; for(var j=0;j<5;j++) stars+='<i class="fa-'+(j<(c.rating||5)?'solid':'regular')+' fa-star"></i>';
    var dateStr=c.createdAt&&c.createdAt.toDate?c.createdAt.toDate().toLocaleDateString('tr-TR'):'—';
    var isApproved=c.status==='approved';
    var sn=escHtml(c.author||'Anonim').replace(/'/g,"\\'");
    var prodHtml=c.productName?'<span class="comment-product"><i class="fa-solid fa-box" style="margin-right:4px;font-size:10px;"></i>'+escHtml(c.productName)+'</span>':'';
    var titleHtml=c.title?'<div style="font-size:13px;font-weight:600;margin-bottom:4px;">&ldquo;'+escHtml(c.title)+'&rdquo;</div>':'';

    /* Onayla butonu (sadece pending için) + Her durumda Sil butonu */
    var actionBtns = '';
    if (!isApproved) {
      actionBtns += '<button class="btn btn-success btn-xs" onclick="approveComment(\''+id+'\')"><i class="fa-solid fa-check"></i> Onayla</button>';
    } else {
      actionBtns += '<span class="badge badge-green"><i class="fa-solid fa-circle-check"></i> Yayında</span>';
    }
    actionBtns += '<button class="btn btn-danger btn-xs" onclick="deleteComment(\''+id+'\',\''+sn+'\')"><i class="fa-solid fa-trash"></i> Sil</button>';

    return '<div class="comment-card '+(isApproved?'approved':'pending')+'" style="animation-delay:'+(i*50)+'ms">'+
      '<div class="comment-avatar">'+initials+'</div>'+
      '<div class="comment-body">'+
        '<div class="comment-header"><span class="comment-author">'+escHtml(c.author||'Anonim')+'</span><div class="comment-stars">'+stars+'</div>'+prodHtml+'<span class="comment-date">'+dateStr+'</span></div>'+
        titleHtml+'<p class="comment-text">'+escHtml(c.text||'')+'</p>'+
        '<div class="comment-actions">'+actionBtns+'</div>'+
      '</div>'+
    '</div>';
  }).join('');
}

async function approveComment(id) {
  try {
    await db.collection('comments').doc(id).update({ status:'approved' });
    showToast('Yorum onaylandı — artık ürün sayfasında görünür.','success');
    await loadComments();
  } catch(err){ showToast('Hata: '+err.message,'error'); }
}

/* ✅ Onaylı yorumlar da silinebilir */
function deleteComment(id,author) {
  openConfirm('"'+author+'" yorumu silinsin mi?','Bu yorum kalıcı olarak silinecek.',async function(){
    try { await db.collection('comments').doc(id).delete(); showToast('Yorum silindi.','success'); await loadComments(); }
    catch(err){ showToast('Hata: '+err.message,'error'); }
  });
}

function filterComments(filter,btn) {
  commentFilter=filter;
  document.querySelectorAll('#panel-comments .toolbar .btn').forEach(function(b){ b.style.borderColor='var(--border)'; b.style.color='var(--text-2)'; b.style.background='var(--surface-2)'; });
  if(btn){ btn.style.borderColor='var(--gold-border)'; btn.style.color='var(--gold)'; btn.style.background='var(--gold-dim)'; }
  renderComments(allComments,filter);
}

/* ── DASHBOARD ── */
async function loadDashboard() {
  document.getElementById('stat-products').textContent = allProducts.length || '—';
  document.getElementById('stat-sale').textContent = allProducts.filter(function(p){return p.data.salePrice;}).length || '0';
}

/* ── CONFIRM ── */
function openConfirm(title,desc,onConfirm) {
  document.getElementById('confirm-title').textContent=title;
  document.getElementById('confirm-desc').textContent=desc;
  document.getElementById('confirm-overlay').classList.add('open');
  confirmCallback=onConfirm;
  document.getElementById('confirm-ok-btn').onclick=function(){ closeConfirm(); if(confirmCallback)confirmCallback(); };
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
  setTimeout(function(){ el.style.transition='opacity .3s'; el.style.opacity='0'; setTimeout(function(){el.remove();},320); },3500);
}

/* ── UTILS ── */
function formatPrice(num){ return Number(num||0).toLocaleString('tr-TR',{style:'currency',currency:'TRY',minimumFractionDigits:2}); }
function escHtml(s){ return String(s!==null&&s!==undefined?s:'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;'); }
function escJs(s){ return String(s||'').replace(/\\/g,'\\\\').replace(/'/g,"\\'").replace(/"/g,'\\"'); }
