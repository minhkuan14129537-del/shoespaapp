// Application Logic for Shoe Spa Manager (Version 2 - Isolated DB & Custom Branding)

// 1. STATE & STORAGE MANAGEMENT
const state = {
  currentUser: null,
  orders: [],
  services: [],
  users: [],
  expenses: [],
  storeInfo: null,
  activeView: 'login',
  currentEditingOrder: null,
  currentEditingService: null,
  currentEditingEmployee: null,
  currentEditingExpense: null,
  tempSelectedFiles: [], // temporary selected files for upload [{id, file, previewUrl}]
  tempExistingImages: [] // existing images kept when editing [{url}]
};

function checkFirebaseRulesWarning(error) {
  if (error && (error.code === 'permission-denied' || (error.message && error.message.toLowerCase().includes('permission')))) {
    let warnBanner = document.getElementById('firebase-warning-banner');
    if (!warnBanner) {
      warnBanner = document.createElement('div');
      warnBanner.id = 'firebase-warning-banner';
      warnBanner.style.cssText = 'background: #FFF3CD; color: #856404; padding: 14px 20px; border-bottom: 2px solid #FFEEBA; text-align: center; font-size: 0.9rem; font-weight: 600; position: sticky; top: 0; z-index: 9999; box-shadow: 0 2px 8px rgba(0,0,0,0.1);';
      document.body.prepend(warnBanner);
    }
    warnBanner.innerHTML = `⚠️ <b>FIREBASE CHƯA CẤP QUYỀN GHI CLOUD (Dự án shoespaapp):</b> Đang dùng dữ liệu lưu tạm trên máy. Cần vào <a href="https://console.firebase.google.com/" target="_blank" style="color: #856404; text-decoration: underline;">Firebase Console</a> &gt; <b>Firestore Database</b> &gt; <b>Rules</b> &gt; sửa thành <code>allow read, write: if true;</code> rồi bấm <b>Publish</b>.`;
  }
}

// ================= MULTI-TENANT DATA ISOLATION HELPERS =================
function getCurrentStoreId() {
  if (!state.currentUser) return 'store_phuibui';
  if (state.currentUser.role === 'superadmin') return 'system';
  if (!state.currentUser.storeId) {
    const matched = (state.users || []).find(u => u.id === state.currentUser.id || (u.email && state.currentUser.email && u.email.toLowerCase() === state.currentUser.email.toLowerCase()));
    if (matched && matched.storeId) {
      state.currentUser.storeId = matched.storeId;
    } else {
      state.currentUser.storeId = 'store_' + (state.currentUser.id || (state.currentUser.email ? state.currentUser.email.replace(/[^a-zA-Z0-9]/g, '') : Date.now()));
    }
    saveState('pb_v2_current_user', state.currentUser);
  }
  return state.currentUser.storeId;
}

function getStoreOrders() {
  const sId = getCurrentStoreId();
  if (!sId) return [];
  if (state.currentUser && state.currentUser.role === 'superadmin') return state.orders;
  return state.orders.filter(o => o.storeId === sId);
}

function getStoreServices() {
  const sId = getCurrentStoreId();
  if (!sId) return [];
  if (state.currentUser && state.currentUser.role === 'superadmin') return state.services;
  return state.services.filter(s => s.storeId === sId);
}

function getStoreExpenses() {
  const sId = getCurrentStoreId();
  if (!sId) return [];
  if (state.currentUser && state.currentUser.role === 'superadmin') return state.expenses;
  return state.expenses.filter(e => e.storeId === sId);
}

function getStoreEmployees() {
  const sId = getCurrentStoreId();
  if (!sId) return [];
  if (state.currentUser && state.currentUser.role === 'superadmin') return state.users.filter(u => u.role !== 'superadmin');
  return state.users.filter(u => u.storeId === sId && (u.role === 'staff' || u.role === 'admin'));
}

function getStoreInfo() {
  const sId = getCurrentStoreId();
  let found = null;

  if (Array.isArray(state.storeInfo) && state.storeInfo.length > 0) {
    found = state.storeInfo.find(info => info && info.storeId === sId);
    if (!found && state.storeInfo.length === 1) {
      found = state.storeInfo[0];
    }
    if (!found && state.currentUser && state.currentUser.storeName) {
      found = state.storeInfo.find(info => info && info.name && info.name.toLowerCase() === state.currentUser.storeName.toLowerCase());
    }
  } else if (state.storeInfo && typeof state.storeInfo === 'object') {
    found = state.storeInfo;
  }

  const storeName = found?.name || state.currentUser?.storeName || 'SPA GIÀY';
  let defaultPrefix = 'DH';
  const words = storeName.replace(/[^a-zA-Z0-9\s]/g, '').trim().split(/\s+/);
  if (words.length >= 2) {
    defaultPrefix = (words[0][0] + words[1][0]).toUpperCase();
  } else if (words.length === 1 && words[0].length >= 2) {
    defaultPrefix = words[0].substring(0, 2).toUpperCase();
  }

  return {
    storeId: found?.storeId || sId,
    name: storeName,
    subtitle: found?.subtitle || 'SHOE SPA & REPAIR',
    hotline: found?.hotline || state.currentUser?.phone || '0906 22 7512',
    address: found?.address || '',
    logoUrl: found?.logoUrl || '',
    orderPrefix: found?.orderPrefix || defaultPrefix,
    receiptNote: found?.receiptNote || 'Cảm ơn quý khách đã tin tưởng dịch vụ của chúng tôi!',
    fbPageId: found?.fbPageId || '',
    fbPageToken: found?.fbPageToken || ''
  };
}

function getStoreOrderPrefix(storeId = getCurrentStoreId()) {
  const info = getStoreInfo();
  if (info && info.orderPrefix && info.orderPrefix.trim()) {
    return info.orderPrefix.trim().toUpperCase();
  }
  const storeName = info?.name || state.currentUser?.storeName || 'SPA';
  const words = storeName.replace(/[^a-zA-Z0-9\s]/g, '').trim().split(/\s+/);
  if (words.length >= 2) {
    return (words[0][0] + words[1][0]).toUpperCase();
  } else if (words.length === 1 && words[0].length >= 2) {
    return words[0].substring(0, 2).toUpperCase();
  }
  return 'DH';
}

function generateNextOrderIdForStore(storeId = getCurrentStoreId()) {
  const prefix = getStoreOrderPrefix(storeId);
  const storeOrders = getStoreOrders();

  let maxNum = 1000;
  storeOrders.forEach(o => {
    if (o.id) {
      const match = o.id.match(/\d+$/);
      if (match) {
        const num = parseInt(match[0], 10);
        if (!isNaN(num) && num > maxNum) {
          maxNum = num;
        }
      }
    }
  });

  const nextNum = maxNum + 1;
  return `${prefix}-${nextNum}`;
}

// Initialize app data from Firebase Cloud (V2 collections) or LocalStorage fallback (pb_v2_* keys)
async function initData() {
  if (window.db) {
    try {
      console.log("Syncing V2 database with Firebase Firestore Cloud (giatgiaythongminh24h)...");
      
      // 0. Load Store Info Branding
      try {
        const storeSnap = await window.db.collection('v2_store_info').get();
        if (!storeSnap.empty) {
          state.storeInfo = storeSnap.docs.map(doc => doc.data());
        } else {
          const defaultInfo = { ...(window.DEFAULT_STORE_INFO || {}), storeId: 'store_phuibui' };
          state.storeInfo = [defaultInfo];
          await window.db.collection('v2_store_info').doc('store_phuibui').set(defaultInfo);
        }
      } catch (e) {
        console.error("Error loading store info from Firebase V2:", e);
        checkFirebaseRulesWarning(e);
        const stored = localStorage.getItem('pb_v2_store_info');
        if (stored) {
          try {
            const parsed = JSON.parse(stored);
            state.storeInfo = Array.isArray(parsed) ? parsed : [parsed];
          } catch (e2) {
            state.storeInfo = [window.DEFAULT_STORE_INFO || {}];
          }
        } else {
          state.storeInfo = [window.DEFAULT_STORE_INFO || {}];
        }
      }
      saveState('pb_v2_store_info', state.storeInfo);

      // 1. Load users
      const usersSnap = await window.db.collection('v2_users').get();
      if (usersSnap.empty) {
        for (let u of window.DEFAULT_USERS || []) {
          await window.db.collection('v2_users').doc(u.id).set(u);
        }
        state.users = window.DEFAULT_USERS || [];
      } else {
        state.users = usersSnap.docs.map(doc => doc.data());
      }
      saveState('pb_v2_users', state.users);

      // 2. Load services
      const servicesSnap = await window.db.collection('v2_services').get();
      if (servicesSnap.empty) {
        for (let s of window.DEFAULT_SERVICES || []) {
          await window.db.collection('v2_services').doc(s.id).set(s);
        }
        state.services = window.DEFAULT_SERVICES || [];
      } else {
        state.services = servicesSnap.docs.map(doc => doc.data());
      }
      saveState('pb_v2_services', state.services);

      // 3. Load orders
      const ordersSnap = await window.db.collection('v2_orders').get();
      state.orders = ordersSnap.docs.map(doc => doc.data());
      saveState('pb_v2_orders', state.orders);

      // 4. Load expenses
      try {
        const expensesSnap = await window.db.collection('v2_expenses').get();
        if (expensesSnap.empty) {
          for (let exp of window.DEFAULT_EXPENSES || []) {
            await window.db.collection('v2_expenses').doc(exp.id).set(exp);
          }
          state.expenses = window.DEFAULT_EXPENSES || [];
        } else {
          state.expenses = expensesSnap.docs.map(doc => doc.data());
        }
      } catch (expErr) {
        console.error("Error loading expenses from Firebase V2:", expErr);
        state.expenses = JSON.parse(localStorage.getItem('pb_v2_expenses') || 'null') || window.DEFAULT_EXPENSES || [];
      }
      saveState('pb_v2_expenses', state.expenses);
      
    } catch (error) {
      console.error("Firebase V2 sync failed, falling back to LocalStorage:", error);
      checkFirebaseRulesWarning(error);
      loadFromLocalStorage();
    }
  } else {
    loadFromLocalStorage();
  }

  // Run strict multi-tenant data migration & sanitization
  sanitizeAndMigrateMultiTenantData();

  // Update dynamic Store Branding UI
  updateStoreBrandingUI();

  // Check for public tracking query parameter ?order=ID
  const urlParams = new URLSearchParams(window.location.search);
  const orderIdParam = urlParams.get('order');
  if (orderIdParam) {
    // Switch view to public tracking and load details
    switchView('public-tracking');
    loadPublicTracking(orderIdParam);
    return;
  }

  // Check login state
  const savedUser = localStorage.getItem('pb_v2_current_user');
  if (savedUser) {
    let parsedUser = JSON.parse(savedUser);

    // Sync saved user with latest data loaded into state.users
    const latestUser = state.users.find(u => u.id === parsedUser.id || (u.email && parsedUser.email && u.email.toLowerCase() === parsedUser.email.toLowerCase()));
    if (latestUser) {
      parsedUser = { ...latestUser };
      saveState('pb_v2_current_user', parsedUser);
    }

    state.currentUser = parsedUser;
    updateProfileUI();

    if (state.currentUser.role === 'superadmin') {
      switchView('saas-admin');
    } else {
      const isExpired = state.currentUser.expiresAt && new Date(state.currentUser.expiresAt) < new Date();
      if (state.currentUser.status === 'pending' || state.currentUser.status === 'locked' || isExpired) {
        showSubscriptionPendingView(state.currentUser, isExpired);
      } else if (state.currentUser.role === 'admin') {
        switchView('dashboard');
      } else {
        switchView('orders');
      }
    }
  } else {
    switchView('login');
  }
}

// Fallback: local storage loader (isolated V2 keys)
function loadFromLocalStorage() {
  if (!localStorage.getItem('pb_v2_store_info')) {
    localStorage.setItem('pb_v2_store_info', JSON.stringify(window.DEFAULT_STORE_INFO || {}));
  }
  if (!localStorage.getItem('pb_v2_users')) {
    localStorage.setItem('pb_v2_users', JSON.stringify(window.DEFAULT_USERS || []));
  }
  if (!localStorage.getItem('pb_v2_services')) {
    localStorage.setItem('pb_v2_services', JSON.stringify(window.DEFAULT_SERVICES || []));
  }
  if (!localStorage.getItem('pb_v2_orders')) {
    localStorage.setItem('pb_v2_orders', JSON.stringify(window.INITIAL_ORDERS || []));
  }
  if (!localStorage.getItem('pb_v2_expenses')) {
    localStorage.setItem('pb_v2_expenses', JSON.stringify(window.DEFAULT_EXPENSES || []));
  }

  const storedInfo = localStorage.getItem('pb_v2_store_info');
  if (storedInfo) {
    try {
      const parsed = JSON.parse(storedInfo);
      state.storeInfo = Array.isArray(parsed) ? parsed : [parsed];
    } catch (e) {
      state.storeInfo = [window.DEFAULT_STORE_INFO || {}];
    }
  } else {
    state.storeInfo = [window.DEFAULT_STORE_INFO || {}];
  }
  state.users = JSON.parse(localStorage.getItem('pb_v2_users'));
  state.services = JSON.parse(localStorage.getItem('pb_v2_services'));
  state.orders = JSON.parse(localStorage.getItem('pb_v2_orders'));
  state.expenses = JSON.parse(localStorage.getItem('pb_v2_expenses'));
}

// Sync helper that updates LocalStorage instantly and uploads to Firebase asynchronously
function saveState(key, data) {
  try {
    localStorage.setItem(key, JSON.stringify(data));
  } catch (e) {
    console.error(`Error saving state for key "${key}" to localStorage:`, e);
  }
}

function sanitizeAndMigrateMultiTenantData() {
  if (!state.users) state.users = [];
  if (!state.orders) state.orders = [];
  if (!state.services) state.services = [];
  if (!state.expenses) state.expenses = [];

  // 1. Ensure every user has a valid storeId
  state.users.forEach(u => {
    if (u.role !== 'superadmin') {
      if (!u.storeId) {
        if (u.email && u.email.toLowerCase().includes('phuibui')) {
          u.storeId = 'store_phuibui';
        } else {
          u.storeId = 'store_' + (u.id || u.email.replace(/[^a-zA-Z0-9]/g, ''));
        }
      }
    } else {
      u.storeId = 'system';
    }
  });
  saveState('pb_v2_users', state.users);

  // Sync state.currentUser if logged in
  if (state.currentUser && state.currentUser.role !== 'superadmin') {
    const matched = state.users.find(u => u.id === state.currentUser.id || (u.email && state.currentUser.email && u.email.toLowerCase() === state.currentUser.email.toLowerCase()));
    if (matched && matched.storeId) {
      state.currentUser.storeId = matched.storeId;
      saveState('pb_v2_current_user', state.currentUser);
    }
  }

  // 2. Sanitize Order storeId mapping
  state.orders.forEach(o => {
    if (o.id) {
      const orderPrefix = o.id.includes('-') ? o.id.split('-')[0].toUpperCase() : '';
      
      if (orderPrefix && orderPrefix !== 'PB') {
        const matchingUser = state.users.find(u => {
          if (u.role === 'superadmin') return false;
          const uPrefix = (u.storeName || u.name || '').replace(/[^a-zA-Z0-9\s]/g, '').trim().split(/\s+/);
          let p = 'DH';
          if (uPrefix.length >= 2) p = (uPrefix[0][0] + uPrefix[1][0]).toUpperCase();
          else if (uPrefix.length === 1 && uPrefix[0].length >= 2) p = uPrefix[0].substring(0, 2).toUpperCase();
          return p === orderPrefix || (u.email && u.email.toUpperCase().includes(orderPrefix));
        });

        if (matchingUser && matchingUser.storeId) {
          o.storeId = matchingUser.storeId;
        }
      } else if (orderPrefix === 'PB' || !o.storeId) {
        o.storeId = 'store_phuibui';
      }
    }
    if (!o.storeId) {
      o.storeId = 'store_phuibui';
    }
  });
  saveState('pb_v2_orders', state.orders);

  // 3. Sanitize services and expenses storeId
  state.services.forEach(s => {
    if (!s.storeId) s.storeId = 'store_phuibui';
  });
  saveState('pb_v2_services', state.services);

  state.expenses.forEach(e => {
    if (!e.storeId) e.storeId = 'store_phuibui';
  });
  saveState('pb_v2_expenses', state.expenses);
}

function toggleMobileSidebar(forceState) {
  const sidebar = document.querySelector('.sidebar');
  const backdrop = document.getElementById('mobile-sidebar-backdrop');
  if (!sidebar) return;

  const isOpen = sidebar.classList.contains('mobile-open');
  const nextState = (typeof forceState === 'boolean') ? forceState : !isOpen;

  if (nextState) {
    sidebar.classList.add('mobile-open');
    if (backdrop) backdrop.classList.add('active');
  } else {
    sidebar.classList.remove('mobile-open');
    if (backdrop) backdrop.classList.remove('active');
  }
}

// 2. SPA ROUTER & NAVIGATION
function switchView(viewId) {
  // Sync state.currentUser with latest in state.users if available
  if (state.currentUser && state.users && state.users.length > 0) {
    const latestUser = state.users.find(u => u.id === state.currentUser.id || (u.email && state.currentUser.email && u.email.toLowerCase() === state.currentUser.email.toLowerCase()));
    if (latestUser) {
      state.currentUser = { ...latestUser };
      saveState('pb_v2_current_user', state.currentUser);
    }
  }

  // Access control
  if (viewId !== 'login' && viewId !== 'public-tracking' && viewId !== 'subscription-pending' && !state.currentUser) {
    viewId = 'login';
  }
  
  if (state.currentUser && state.currentUser.role !== 'superadmin' && viewId !== 'subscription-pending' && viewId !== 'login' && viewId !== 'public-tracking') {
    const isExpired = state.currentUser.expiresAt && new Date(state.currentUser.expiresAt) < new Date();
    if (state.currentUser.status === 'pending' || state.currentUser.status === 'locked' || isExpired) {
      showSubscriptionPendingView(state.currentUser, isExpired);
      return;
    }
  }

  if (state.currentUser && state.currentUser.role === 'staff' && ['dashboard', 'services', 'employees', 'store-settings', 'expenses', 'saas-admin'].includes(viewId)) {
    viewId = 'orders';
  }

  if (state.currentUser && state.currentUser.role === 'superadmin' && viewId !== 'login' && viewId !== 'public-tracking') {
    viewId = 'saas-admin';
  } else if (state.currentUser && state.currentUser.role !== 'superadmin' && viewId === 'saas-admin') {
    viewId = 'dashboard';
  }

  state.activeView = viewId;

  // Close mobile sidebar drawer if open
  toggleMobileSidebar(false);

  const workspace = document.getElementById('app-workspace');
  if (viewId === 'login' || viewId === 'subscription-pending' || viewId === 'public-tracking') {
    if (workspace) workspace.style.display = 'none';
  } else {
    if (workspace) workspace.style.display = 'flex';
  }

  // Update UI active sections
  document.querySelectorAll('.view-section').forEach(sec => {
    sec.classList.remove('active');
    sec.style.display = 'none';
  });
  
  const targetSec = document.getElementById(`view-${viewId}`);
  if (targetSec) {
    targetSec.classList.add('active');
    if (viewId === 'login' || viewId === 'subscription-pending' || viewId === 'public-tracking') {
      targetSec.style.display = 'flex';
    } else {
      targetSec.style.display = 'block';
    }
  }

  // Update Sidebar menu active class
  document.querySelectorAll('.sidebar-menu li').forEach(li => {
    li.classList.remove('active');
    if (li.getAttribute('data-view') === viewId) {
      li.classList.add('active');
    }
  });

  // Update Mobile Bottom Nav active class
  document.querySelectorAll('.mobile-bottom-nav .mobile-nav-item').forEach(item => {
    item.classList.remove('active');
    if (item.getAttribute('data-view') === viewId) {
      item.classList.add('active');
    }
  });

  // Handle specific view rendering
  if (viewId === 'dashboard') {
    renderDashboard();
  } else if (viewId === 'orders') {
    renderOrders();
  } else if (viewId === 'expenses') {
    renderExpenses();
  } else if (viewId === 'customers') {
    renderCustomers();
  } else if (viewId === 'services') {
    renderServicesList();
  } else if (viewId === 'employees') {
    renderEmployeesList();
  } else if (viewId === 'store-settings') {
    populateStoreSettingsForm();
  } else if (viewId === 'content-studio') {
    renderContentStudio();
  } else if (viewId === 'saas-admin') {
    renderSaasAdminView();
  }
}

// Dynamic Store Branding UI Update
function updateStoreBrandingUI() {
  const info = getStoreInfo();
  const storeName = info.name || 'SPA GIÀY';
  const storeSubtitle = info.subtitle || 'SHOE SPA & REPAIR';
  const storeHotline = info.hotline || '0906 22 7512';
  const storeAddress = info.address || '';
  const storeLogo = info.logoUrl || '';
  const receiptNote = info.receiptNote || '';

  document.title = `${storeName} - Quản lý cửa hàng`;

  // Sidebar & Mobile Header
  const sidebarName = document.getElementById('sidebar-brand-name');
  if (sidebarName) sidebarName.textContent = storeName;
  const mobileName = document.getElementById('mobile-brand-name');
  if (mobileName) mobileName.textContent = storeName;
  const sidebarSub = document.getElementById('sidebar-brand-subtitle');
  if (sidebarSub) sidebarSub.textContent = storeSubtitle;
  const sidebarLogoContainer = document.getElementById('sidebar-brand-logo-container');
  const sidebarLogoImg = document.getElementById('sidebar-brand-logo-img');
  if (sidebarLogoContainer && sidebarLogoImg) {
    if (storeLogo) {
      sidebarLogoImg.src = storeLogo;
      sidebarLogoContainer.style.display = 'block';
    } else {
      sidebarLogoContainer.style.display = 'none';
    }
  }

  // Login Card
  const loginName = document.getElementById('login-brand-name');
  if (loginName) loginName.textContent = storeName;
  const loginSub = document.getElementById('login-brand-subtitle');
  if (loginSub) loginSub.textContent = `Hệ thống Quản lý cửa hàng ${storeName}`;
  const loginLogoContainer = document.getElementById('login-brand-logo-container');
  const loginLogoImg = document.getElementById('login-brand-logo-img');
  if (loginLogoContainer && loginLogoImg) {
    if (storeLogo) {
      loginLogoImg.src = storeLogo;
      loginLogoContainer.style.display = 'block';
    } else {
      loginLogoContainer.style.display = 'none';
    }
  }

  // Thermal Receipt Header & Footer
  const printName = document.getElementById('print-brand-name');
  if (printName) printName.textContent = storeName;
  const printSub = document.getElementById('print-brand-subtitle');
  if (printSub) printSub.textContent = storeSubtitle;
  const printAddress = document.getElementById('print-brand-address');
  if (printAddress) printAddress.textContent = storeAddress;
  const printHotline = document.getElementById('print-brand-hotline');
  if (printHotline) printHotline.textContent = storeHotline;
  const printLogoContainer = document.getElementById('print-brand-logo-container');
  const printLogoImg = document.getElementById('print-brand-logo-img');
  if (printLogoContainer && printLogoImg) {
    if (storeLogo) {
      printLogoImg.src = storeLogo;
      printLogoContainer.style.display = 'block';
    } else {
      printLogoContainer.style.display = 'none';
    }
  }
  const printNote = document.getElementById('print-receipt-note');
  if (printNote) {
    if (receiptNote) {
      printNote.innerHTML = receiptNote.replace(/\n/g, '<br>');
    } else {
      printNote.innerHTML = `<p>Cảm ơn quý khách đã tin tưởng dịch vụ của chúng tôi!</p><p>Quý khách vui lòng mang hóa đơn này khi nhận lại giày.</p>`;
    }
  }

  // Public Tracking Page Header & Contacts
  const trackName = document.getElementById('track-brand-name');
  if (trackName) trackName.textContent = storeName;
  const trackSub = document.getElementById('track-brand-subtitle');
  if (trackSub) trackSub.textContent = storeSubtitle;
  const trackLogoContainer = document.getElementById('track-brand-logo-container');
  const trackLogoImg = document.getElementById('track-brand-logo-img');
  if (trackLogoContainer && trackLogoImg) {
    if (storeLogo) {
      trackLogoImg.src = storeLogo;
      trackLogoContainer.style.display = 'block';
    } else {
      trackLogoContainer.style.display = 'none';
    }
  }

  const trackContactTitle = document.getElementById('track-brand-contact-title');
  if (trackContactTitle) trackContactTitle.textContent = `Cần hỗ trợ? Liên hệ ${storeName}:`;

  const cleanHotline = storeHotline.replace(/\s+/g, '');
  const trackHotlineBtn = document.getElementById('track-brand-hotline-btn');
  if (trackHotlineBtn) trackHotlineBtn.href = `tel:${cleanHotline}`;
  const trackHotlineText = document.getElementById('track-brand-hotline-text');
  if (trackHotlineText) trackHotlineText.textContent = `Hotline: ${storeHotline}`;

  const trackZaloBtn = document.getElementById('track-brand-zalo-btn');
  if (trackZaloBtn) trackZaloBtn.href = `https://zalo.me/${cleanHotline}`;

  const trackAddress = document.getElementById('track-brand-address');
  if (trackAddress) trackAddress.textContent = `Địa chỉ: ${storeAddress}`;
}

// Populate Store Settings Form
function populateStoreSettingsForm() {
  const info = getStoreInfo();
  const nameInput = document.getElementById('store-name-input');
  if (nameInput) nameInput.value = info.name || '';
  const subInput = document.getElementById('store-subtitle-input');
  if (subInput) subInput.value = info.subtitle || '';
  const hotInput = document.getElementById('store-hotline-input');
  if (hotInput) hotInput.value = info.hotline || '';
  const addrInput = document.getElementById('store-address-input');
  if (addrInput) addrInput.value = info.address || '';
  const prefixInput = document.getElementById('store-order-prefix-input');
  if (prefixInput) prefixInput.value = info.orderPrefix || getStoreOrderPrefix();
  const logoInput = document.getElementById('store-logo-url');
  if (logoInput) logoInput.value = info.logoUrl || '';
  const noteInput = document.getElementById('store-receipt-note-input');
  if (noteInput) noteInput.value = info.receiptNote || '';
  const fbPageIdInput = document.getElementById('store-fb-page-id');
  if (fbPageIdInput) fbPageIdInput.value = info.fbPageId || '';
  const fbPageTokenInput = document.getElementById('store-fb-page-token');
  if (fbPageTokenInput) fbPageTokenInput.value = info.fbPageToken || '';

  updateStoreLogoPreview(info.logoUrl || '');
}

function updateStoreLogoPreviewFromInput() {
  const url = document.getElementById('store-logo-url').value.trim();
  updateStoreLogoPreview(url);
}

function updateStoreLogoPreview(url) {
  const preview = document.getElementById('store-logo-preview');
  if (preview) {
    if (url) {
      preview.innerHTML = `<img src="${url}" style="width: 100%; height: 100%; object-fit: contain;">`;
    } else {
      preview.innerHTML = `<span style="font-size: 0.75rem; color: #888; text-align: center; padding: 4px;">Chưa có logo</span>`;
    }
  }
  livePreviewStoreBranding();
}

function livePreviewStoreBranding() {
  const name = document.getElementById('store-name-input')?.value.trim();
  const subtitle = document.getElementById('store-subtitle-input')?.value.trim();
  const logoUrl = document.getElementById('store-logo-url')?.value.trim();

  if (name) {
    const sidebarName = document.getElementById('sidebar-brand-name');
    if (sidebarName) sidebarName.textContent = name;
  }
  if (subtitle) {
    const sidebarSub = document.getElementById('sidebar-brand-subtitle');
    if (sidebarSub) sidebarSub.textContent = subtitle;
  }
  const sidebarLogoContainer = document.getElementById('sidebar-brand-logo-container');
  const sidebarLogoImg = document.getElementById('sidebar-brand-logo-img');
  if (sidebarLogoContainer && sidebarLogoImg) {
    if (logoUrl) {
      sidebarLogoImg.src = logoUrl;
      sidebarLogoContainer.style.display = 'block';
    } else {
      sidebarLogoContainer.style.display = 'none';
    }
  }
}

async function handleStoreLogoSelect(e) {
  const file = e.target.files[0];
  if (!file) return;
  try {
    const compressed = await compressImage(file, 400, 400, 0.85);
    document.getElementById('store-logo-url').value = compressed;
    updateStoreLogoPreview(compressed);
  } catch (err) {
    console.error("Lỗi nén logo:", err);
  }
}

async function handleStoreSettingsSubmit(e) {
  e.preventDefault();
  const name = document.getElementById('store-name-input').value.trim();
  const subtitle = document.getElementById('store-subtitle-input').value.trim();
  const hotline = document.getElementById('store-hotline-input').value.trim();
  const address = document.getElementById('store-address-input').value.trim();
  const orderPrefix = (document.getElementById('store-order-prefix-input')?.value || '').trim().toUpperCase() || getStoreOrderPrefix();
  const logoUrl = document.getElementById('store-logo-url').value.trim();
  const receiptNote = document.getElementById('store-receipt-note-input').value.trim();
  const fbPageId = document.getElementById('store-fb-page-id').value.trim();
  const fbPageToken = document.getElementById('store-fb-page-token').value.trim();

  const storeId = getCurrentStoreId();
  const updatedInfo = {
    storeId,
    name,
    subtitle,
    hotline,
    address,
    orderPrefix,
    logoUrl,
    receiptNote,
    fbPageId,
    fbPageToken
  };

  if (!Array.isArray(state.storeInfo)) {
    state.storeInfo = state.storeInfo ? [state.storeInfo] : [];
  }

  const existingIdx = state.storeInfo.findIndex(info => info && info.storeId === storeId);
  if (existingIdx >= 0) {
    state.storeInfo[existingIdx] = updatedInfo;
  } else {
    state.storeInfo.push(updatedInfo);
  }

  if (state.currentUser) {
    state.currentUser.storeName = name;
    saveState('pb_v2_current_user', state.currentUser);
    const userInList = (state.users || []).find(u => u.id === state.currentUser.id || (u.email && state.currentUser.email && u.email.toLowerCase() === state.currentUser.email.toLowerCase()));
    if (userInList) {
      userInList.storeName = name;
      saveState('pb_v2_users', state.users);
      if (window.db) {
        try {
          await window.db.collection('v2_users').doc(userInList.id).update({ storeName: name });
        } catch(err) {
          console.error("Error updating user storeName in Firebase:", err);
        }
      }
    }
  }

  saveState('pb_v2_store_info', state.storeInfo);

  let cloudSynced = false;
  if (window.db) {
    try {
      await window.db.collection('v2_store_info').doc(storeId).set(updatedInfo);
      console.log(`Synced store info for ${storeId} to Firebase V2.`);
      cloudSynced = true;
    } catch (err) {
      console.error("Error syncing store info to Firebase V2:", err);
      checkFirebaseRulesWarning(err);
      alert(`⚠️ CẢNH BÁO FIREBASE RULES (Dự án giatgiaythongminh24h):\n\nKhông thể lưu lên Cloud Firebase do chưa mở quyền ghi (Rules).\n\nChi tiết lỗi: ${err.message}\n\nHướng dẫn bật quyền ghi trên Firebase:\n1. Mở Firebase Console -> Dự án 'giatgiaythongminh24h'\n2. Chọn Firestore Database -> tab Rules\n3. Đổi thành: allow read, write: if true; và bấm Publish!`);
    }
  }

  updateStoreBrandingUI();

  const msg = document.getElementById('store-settings-msg');
  if (msg) {
    msg.style.display = 'inline';
    msg.textContent = cloudSynced ? '✓ Đã lưu & đồng bộ Cloud Firebase thành công!' : '⚠️ Đã lưu tạm trên máy (chưa đẩy được lên Cloud Firebase)!';
    setTimeout(() => { msg.style.display = 'none'; }, 4000);
  }

  if (cloudSynced || !window.db) {
    alert('Cập nhật thông tin cửa hàng thành công!');
  }
}

// Update profile in sidebar
function updateProfileUI() {
  const profileContainer = document.getElementById('sidebar-profile');
  if (state.currentUser) {
    profileContainer.style.display = 'flex';
    document.getElementById('profile-name').textContent = state.currentUser.name;
    
    let roleText = 'Nhân viên';
    if (state.currentUser.role === 'superadmin') roleText = 'Super Admin';
    else if (state.currentUser.role === 'admin') roleText = 'Chủ Cửa Hàng';
    document.getElementById('profile-role').textContent = roleText;

    const initials = state.currentUser.name ? state.currentUser.name.split(' ').pop().substring(0, 2).toUpperCase() : 'US';
    document.getElementById('profile-initials').textContent = initials;
    const mobileInitials = document.getElementById('mobile-user-initials');
    if (mobileInitials) mobileInitials.textContent = initials;
    
    // Hide/Show Menu Items by Role
    const isSuperAdmin = state.currentUser.role === 'superadmin';
    const isStaff = state.currentUser.role === 'staff';

    // Super Admin items
    document.querySelectorAll('.sidebar-menu .superadmin-only').forEach(item => {
      item.style.display = isSuperAdmin ? 'block' : 'none';
    });

    // Store operational items (hidden completely for Super Admin)
    document.querySelectorAll('.sidebar-menu .store-only').forEach(item => {
      if (isSuperAdmin) {
        item.style.display = 'none';
      } else if (isStaff) {
        item.style.display = item.classList.contains('admin-only') ? 'none' : 'block';
      } else {
        item.style.display = 'block';
      }
    });
  } else {
    profileContainer.style.display = 'none';
  }
}

// 3. AUTHENTICATION & SUBSCRIPTION FLOW
function toggleAuthTab(tab) {
  const loginForm = document.getElementById('login-form');
  const registerForm = document.getElementById('register-form');
  const tabLoginBtn = document.getElementById('tab-login-btn');
  const tabRegisterBtn = document.getElementById('tab-register-btn');

  if (tab === 'register') {
    if (loginForm) loginForm.style.display = 'none';
    if (registerForm) registerForm.style.display = 'block';
    if (tabLoginBtn) tabLoginBtn.classList.remove('active');
    if (tabRegisterBtn) tabRegisterBtn.classList.add('active');
  } else {
    if (registerForm) registerForm.style.display = 'none';
    if (loginForm) loginForm.style.display = 'block';
    if (tabRegisterBtn) tabRegisterBtn.classList.remove('active');
    if (tabLoginBtn) tabLoginBtn.classList.add('active');
  }
}

async function handleRegister(e) {
  e.preventDefault();
  const storeName = document.getElementById('register-store-name').value.trim();
  const ownerName = document.getElementById('register-owner-name').value.trim();
  const email = document.getElementById('register-email').value.trim();
  const phone = document.getElementById('register-phone').value.trim();
  const password = document.getElementById('register-password').value;
  const confirmPassword = document.getElementById('register-confirm-password').value;
  const selectedPackage = document.getElementById('register-package').value;
  const msg = document.getElementById('register-msg');

  if (password !== confirmPassword) {
    msg.style.display = 'block';
    msg.style.background = '#fee2e2';
    msg.style.color = '#991b1b';
    msg.textContent = '❌ Mật khẩu xác nhận không khớp. Vui lòng kiểm tra lại!';
    return;
  }

  const existing = state.users.find(u => u.email.toLowerCase() === email.toLowerCase());
  if (existing) {
    msg.style.display = 'block';
    msg.style.background = '#fee2e2';
    msg.style.color = '#991b1b';
    msg.textContent = '❌ Email này đã được đăng ký. Vui lòng chọn Đăng nhập hoặc sử dụng email khác!';
    return;
  }

  const newStoreId = 'store_' + Date.now();
  const newUser = {
    id: 'u-' + Date.now(),
    storeId: newStoreId,
    email: email,
    password: password,
    name: ownerName,
    phone: phone,
    storeName: storeName,
    role: 'admin',
    status: 'pending',
    package: selectedPackage,
    packageStatus: 'pending_activation',
    expiresAt: null,
    createdAt: new Date().toISOString()
  };

  state.users.push(newUser);
  saveState('pb_v2_users', state.users);

  // Seed default services for this new store
  const newStoreServices = (window.DEFAULT_SERVICES || []).map((s, idx) => ({
    ...s,
    id: `vs-${newStoreId}-${idx}`,
    storeId: newStoreId
  }));
  state.services.push(...newStoreServices);
  saveState('pb_v2_services', state.services);

  // Seed store info for this new store
  const words = storeName.replace(/[^a-zA-Z0-9\s]/g, '').trim().split(/\s+/);
  let defaultPrefix = 'DH';
  if (words.length >= 2) {
    defaultPrefix = (words[0][0] + words[1][0]).toUpperCase();
  } else if (words.length === 1 && words[0].length >= 2) {
    defaultPrefix = words[0].substring(0, 2).toUpperCase();
  }

  const newStoreInfo = {
    storeId: newStoreId,
    name: storeName,
    subtitle: 'SHOE SPA & REPAIR',
    hotline: phone,
    address: '',
    logoUrl: '',
    orderPrefix: defaultPrefix,
    receiptNote: 'Cảm ơn quý khách đã tin tưởng dịch vụ của chúng tôi!\nQuý khách vui lòng mang hóa đơn này khi nhận lại giày.'
  };
  if (!Array.isArray(state.storeInfo)) {
    state.storeInfo = [state.storeInfo || window.DEFAULT_STORE_INFO];
  }
  state.storeInfo.push(newStoreInfo);
  saveState('pb_v2_store_info', state.storeInfo);

  if (window.db) {
    try {
      await window.db.collection('v2_users').doc(newUser.id).set(newUser);
      await window.db.collection('v2_store_info').doc(newStoreId).set(newStoreInfo);
      for (let serv of newStoreServices) {
        await window.db.collection('v2_services').doc(serv.id).set(serv);
      }
      console.log(`Synced new registration user ${newUser.id} & store ${newStoreId} to Firebase.`);
    } catch (err) {
      console.error("Error syncing registered store to Firebase:", err);
    }
  }

  msg.style.display = 'block';
  msg.style.background = '#dcfce7';
  msg.style.color = '#166534';
  msg.textContent = '🎉 Đăng ký tài khoản thành công! Bạn có thể đăng nhập ngay để kiểm tra trạng thái kích hoạt.';

  setTimeout(() => {
    document.getElementById('register-form').reset();
    msg.style.display = 'none';
    toggleAuthTab('login');
    document.getElementById('login-email').value = email;
    document.getElementById('login-password').focus();
  }, 2000);
}

function handleLogin(e) {
  e.preventDefault();
  const email = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-password').value;
  const errorMsg = document.getElementById('login-error-msg');

  const user = state.users.find(u => u.email.toLowerCase() === email.toLowerCase() && u.password === password);
  if (user) {
    state.currentUser = user;
    localStorage.setItem('pb_v2_current_user', JSON.stringify(user));
    errorMsg.style.display = 'none';
    
    document.getElementById('login-email').value = '';
    document.getElementById('login-password').value = '';
    
    updateProfileUI();
    updateStoreBrandingUI();
    
    if (user.role === 'superadmin') {
      switchView('saas-admin');
      return;
    }

    const isExpired = user.expiresAt && new Date(user.expiresAt) < new Date();
    if (user.status === 'pending' || user.status === 'locked' || isExpired) {
      showSubscriptionPendingView(user, isExpired);
      return;
    }

    if (user.role === 'admin') {
      switchView('dashboard');
    } else {
      switchView('orders');
    }
  } else {
    errorMsg.style.display = 'block';
    errorMsg.textContent = 'Email hoặc mật khẩu không đúng.';
  }
}

function showSubscriptionPendingView(user, isExpired) {
  const storeNameElem = document.getElementById('pending-store-name');
  const ownerNameElem = document.getElementById('pending-owner-name');
  const emailElem = document.getElementById('pending-email');
  const packageElem = document.getElementById('pending-package-name');
  const badgeElem = document.getElementById('pending-status-badge');
  const titleElem = document.getElementById('pending-title');
  const msgElem = document.getElementById('pending-message');

  const pkgCatalog = window.SUBSCRIPTION_PACKAGES || [];
  const pkg = pkgCatalog.find(p => p.id === user.package) || { name: user.package || 'Chưa chọn' };

  if (storeNameElem) storeNameElem.textContent = user.storeName || user.name || 'Cửa hàng Spa Giày';
  if (ownerNameElem) ownerNameElem.textContent = user.name || '--';
  if (emailElem) emailElem.textContent = user.email || '--';
  if (packageElem) packageElem.textContent = pkg.name;

  if (user.status === 'locked') {
    if (titleElem) titleElem.textContent = 'TÀI KHOẢN ĐÃ BỊ KHOÁ';
    if (msgElem) msgElem.textContent = 'Tài khoản cửa hàng của bạn hiện đã bị tạm khóa. Vui lòng liên hệ Admin hệ thống để mở khóa.';
    if (badgeElem) {
      badgeElem.className = 'badge-status-locked';
      badgeElem.textContent = 'Tạm khóa';
    }
  } else if (isExpired) {
    if (titleElem) titleElem.textContent = 'GÓI DỊCH VỤ ĐÃ HẾT HẠN';
    if (msgElem) msgElem.textContent = `Gói dịch vụ cửa hàng của bạn đã hết hạn ngày ${user.expiresAt}. Vui lòng gia hạn gói để tiếp tục sử dụng.`;
    if (badgeElem) {
      badgeElem.className = 'badge-status-expired';
      badgeElem.textContent = 'Hết hạn';
    }
  } else {
    if (titleElem) titleElem.textContent = 'TÀI KHOẢN CHỜ KÍCH HOẠT GÓI';
    if (msgElem) msgElem.textContent = 'Tài khoản cửa hàng đã được tạo thành công và đang chờ Admin kích hoạt gói cước dịch vụ.';
    if (badgeElem) {
      badgeElem.className = 'badge-status-pending';
      badgeElem.textContent = 'Chờ duyệt kích hoạt';
    }
  }

  switchView('subscription-pending');
}

async function checkUserActivationStatus() {
  if (typeof showToast === 'function') {
    showToast('Đang kiểm tra trạng thái kích hoạt...');
  }
  if (!state.currentUser) {
    switchView('login');
    return;
  }

  // Re-fetch users from Firebase Cloud if available
  if (window.db) {
    try {
      const usersSnap = await window.db.collection('v2_users').get();
      if (!usersSnap.empty) {
        state.users = usersSnap.docs.map(doc => doc.data());
        saveState('pb_v2_users', state.users);
      }
    } catch (e) {
      console.error("Error re-checking v2_users from Firebase Cloud:", e);
    }
  } else {
    state.users = JSON.parse(localStorage.getItem('pb_v2_users') || '[]') || state.users;
  }

  const latestUser = state.users.find(u => u.id === state.currentUser.id || (u.email && state.currentUser.email && u.email.toLowerCase() === state.currentUser.email.toLowerCase()));

  if (latestUser) {
    state.currentUser = { ...latestUser };
    saveState('pb_v2_current_user', state.currentUser);
    updateProfileUI();

    const isExpired = state.currentUser.expiresAt && new Date(state.currentUser.expiresAt) < new Date();

    if (state.currentUser.status === 'active' && !isExpired) {
      alert('🎉 Gói cước tài khoản của bạn đã được kích hoạt thành công! Đang chuyển đến giao diện quản lý...');
      if (state.currentUser.role === 'admin') {
        switchView('dashboard');
      } else {
        switchView('orders');
      }
    } else if (state.currentUser.status === 'locked') {
      showSubscriptionPendingView(state.currentUser, isExpired);
      alert('⚠️ Tài khoản của bạn hiện đang bị khóa. Vui lòng liên hệ Admin qua Zalo.');
    } else if (isExpired) {
      showSubscriptionPendingView(state.currentUser, isExpired);
      alert('⚠️ Gói cước của bạn đã hết hạn. Vui lòng gia hạn gói.');
    } else {
      showSubscriptionPendingView(state.currentUser, isExpired);
      alert('⏳ Tài khoản của bạn vẫn đang ở trạng thái CHỜ KÍCH HOẠT. Nếu đã thanh toán, xin vui lòng nhắn Zalo 0906 22 7512 để Admin duyệt ngay.');
    }
  } else {
    alert('Không tìm thấy thông tin tài khoản. Vui lòng đăng nhập lại.');
    handleLogout();
  }
}

function handleLogout() {
  state.currentUser = null;
  localStorage.removeItem('pb_v2_current_user');
  updateProfileUI();
  updateStoreBrandingUI();
  switchView('login');
}

// 4. SUPER ADMIN SAAS MANAGEMENT FUNCTIONS
function renderSaasAdminView() {
  const tbody = document.getElementById('saas-users-table-body');
  if (!tbody) return;

  const users = state.users.filter(u => u.role !== 'superadmin');
  const pkgCatalog = window.SUBSCRIPTION_PACKAGES || [];

  // High-level Super Admin KPI Calculations
  const totalStores = users.length;
  const activeStores = users.filter(u => u.status === 'active' && (!u.expiresAt || new Date(u.expiresAt) >= new Date())).length;
  const pendingStores = users.filter(u => u.status === 'pending').length;
  const expiredStores = users.filter(u => u.expiresAt && new Date(u.expiresAt) < new Date()).length;

  const totalGMV = (state.orders || [])
    .filter(o => o.status !== 'cancelled')
    .reduce((sum, o) => sum + Number(o.totalPrice || 0), 0);

  const totalOrdersCount = (state.orders || []).length;

  let totalSubRev = 0;
  users.forEach(u => {
    const pkg = pkgCatalog.find(p => p.id === u.package);
    if (pkg && pkg.price) {
      if (u.status === 'active') {
        totalSubRev += Number(pkg.price);
      }
    }
  });

  const elStores = document.getElementById('saas-stat-total-stores');
  if (elStores) elStores.textContent = totalStores;

  const elActive = document.getElementById('saas-stat-active-stores');
  if (elActive) elActive.textContent = `${activeStores} Đang dùng`;

  const elPending = document.getElementById('saas-stat-pending-stores');
  if (elPending) elPending.textContent = `${pendingStores} Chờ kích hoạt`;

  const elGMV = document.getElementById('saas-stat-total-gmv');
  if (elGMV) elGMV.textContent = formatVND(totalGMV);

  const elOrders = document.getElementById('saas-stat-total-orders');
  if (elOrders) elOrders.textContent = totalOrdersCount;

  const elSubRev = document.getElementById('saas-stat-total-sub-revenue');
  if (elSubRev) elSubRev.textContent = formatVND(totalSubRev);

  const searchVal = (document.getElementById('saas-search')?.value || '').toLowerCase();
  const statusFilter = document.getElementById('saas-filter-status')?.value || 'all';

  const filtered = users.filter(u => {
    const matchesSearch = (u.storeName || '').toLowerCase().includes(searchVal) ||
                          (u.name || '').toLowerCase().includes(searchVal) ||
                          (u.email || '').toLowerCase().includes(searchVal) ||
                          (u.phone || '').toLowerCase().includes(searchVal);
    
    let matchesStatus = true;
    const isExpired = u.expiresAt && new Date(u.expiresAt) < new Date();
    if (statusFilter === 'pending') matchesStatus = u.status === 'pending';
    else if (statusFilter === 'active') matchesStatus = u.status === 'active' && !isExpired;
    else if (statusFilter === 'expired') matchesStatus = isExpired;
    else if (statusFilter === 'locked') matchesStatus = u.status === 'locked';

    return matchesSearch && matchesStatus;
  });

  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: var(--text-muted); padding: 24px;">Không tìm thấy tài khoản cửa hàng nào.</td></tr>`;
    return;
  }

  tbody.innerHTML = filtered.map(u => {
    const pkg = pkgCatalog.find(p => p.id === u.package) || { name: u.package || 'Chưa chọn' };
    const isExpired = u.expiresAt && new Date(u.expiresAt) < new Date();

    let badgeHtml = '';
    if (u.status === 'pending') badgeHtml = '<span class="badge-status-pending">Chờ kích hoạt</span>';
    else if (u.status === 'locked') badgeHtml = '<span class="badge-status-locked">Tạm khóa</span>';
    else if (isExpired) badgeHtml = '<span class="badge-status-expired">Hết hạn</span>';
    else badgeHtml = '<span class="badge-status-active">Đang hoạt động</span>';

    const expDateStr = u.expiresAt ? u.expiresAt : 'Chưa có';

    return `
      <tr>
        <td>
          <strong>${u.storeName || 'Chưa đặt tên'}</strong><br>
          <span style="font-size: 0.85rem; color: var(--text-muted);">${u.name} (${u.role === 'admin' ? 'Chủ CH' : 'Nhân viên'})</span>
        </td>
        <td>
          <div>${u.email}</div>
          <div style="font-size: 0.85rem; color: var(--text-muted);">${u.phone || '--'}</div>
        </td>
        <td><strong>${pkg.name}</strong></td>
        <td>${badgeHtml}</td>
        <td>${expDateStr}</td>
        <td style="text-align: right; white-space: nowrap;">
          <button class="btn btn-sm btn-primary" onclick="openActivatePackageModal('${u.id}')" style="background: #16a34a; border-color: #16a34a; margin-right: 4px;">⚡ Kích hoạt / Gia hạn</button>
          <button class="btn btn-sm btn-secondary" onclick="toggleUserLock('${u.id}')" style="margin-right: 4px;">${u.status === 'locked' ? '🔓 Mở khóa' : '🔒 Khóa'}</button>
          <button class="btn btn-sm btn-secondary" onclick="deleteUserAccount('${u.id}')" style="color: #ef4444;">🗑️ Xóa</button>
        </td>
      </tr>
    `;
  }).join('');
}

function openActivatePackageModal(userId) {
  const user = state.users.find(u => u.id === userId);
  if (!user) return;

  document.getElementById('activate-user-id').value = user.id;
  document.getElementById('act-modal-store-name').textContent = user.storeName || user.name;
  document.getElementById('act-modal-email').textContent = user.email;

  const pkgSelect = document.getElementById('act-package-select');
  if (pkgSelect) pkgSelect.value = user.package || 'yearly';

  const statusSelect = document.getElementById('act-status-select');
  if (statusSelect) statusSelect.value = user.status || 'active';

  const dateInput = document.getElementById('act-expires-date');
  if (dateInput) {
    if (user.expiresAt) {
      dateInput.value = user.expiresAt;
    } else {
      updateActivatePackageDuration();
    }
  }

  document.getElementById('modal-activate-package').style.display = 'flex';
}

function closeActivatePackageModal() {
  document.getElementById('modal-activate-package').style.display = 'none';
}

function updateActivatePackageDuration() {
  const pkgId = document.getElementById('act-package-select').value;
  const dateInput = document.getElementById('act-expires-date');
  const pkgCatalog = window.SUBSCRIPTION_PACKAGES || [];
  const pkg = pkgCatalog.find(p => p.id === pkgId);

  const now = new Date();
  const days = pkg ? pkg.durationDays : 365;
  now.setDate(now.getDate() + days);

  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');

  dateInput.value = `${yyyy}-${mm}-${dd}`;
}

async function handleActivatePackageSubmit(e) {
  e.preventDefault();
  const userId = document.getElementById('activate-user-id').value;
  const user = state.users.find(u => u.id === userId);
  if (!user) return;

  user.package = document.getElementById('act-package-select').value;
  user.expiresAt = document.getElementById('act-expires-date').value;
  user.status = document.getElementById('act-status-select').value;
  user.packageStatus = user.status === 'active' ? 'active' : user.status;

  saveState('pb_v2_users', state.users);

  if (window.db) {
    try {
      await window.db.collection('v2_users').doc(user.id).update({
        package: user.package,
        expiresAt: user.expiresAt,
        status: user.status,
        packageStatus: user.packageStatus
      });
      console.log(`Updated package activation for user ${user.id} in Firebase.`);
    } catch (err) {
      console.error("Error updating user package in Firebase:", err);
    }
  }

  closeActivatePackageModal();
  renderSaasAdminView();
  alert(`Đã cập nhật gói dịch vụ cho cửa hàng ${user.storeName || user.email} thành công!`);
}

async function toggleUserLock(userId) {
  const user = state.users.find(u => u.id === userId);
  if (!user) return;

  user.status = user.status === 'locked' ? 'active' : 'locked';
  saveState('pb_v2_users', state.users);

  if (window.db) {
    try {
      await window.db.collection('v2_users').doc(user.id).update({ status: user.status });
    } catch (err) {
      console.error("Error toggling user lock in Firebase:", err);
    }
  }

  renderSaasAdminView();
}

async function deleteUserAccount(userId) {
  const user = state.users.find(u => u.id === userId);
  if (!user) return;

  if (!confirm(`Bạn có chắc chắn muốn xóa tài khoản cửa hàng "${user.storeName || user.email}"?`)) return;

  state.users = state.users.filter(u => u.id !== userId);
  saveState('pb_v2_users', state.users);

  if (window.db) {
    try {
      await window.db.collection('v2_users').doc(userId).delete();
    } catch (err) {
      console.error("Error deleting user from Firebase:", err);
    }
  }

  renderSaasAdminView();
}

// Helper: Format currency
function formatVND(amount) {
  return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(amount);
}

// Helper: Format DateTime
function formatDateTime(dateStr) {
  if (!dateStr) return '-';
  const d = new Date(dateStr);
  return `${d.getDate().toString().padStart(2, '0')}/${(d.getMonth() + 1).toString().padStart(2, '0')}/${d.getFullYear()} ${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
}

// Helper: Date Matching Logic
function isDateMatch(receivedDateStr, filterDate, filterMonth, filterYear) {
  if (!receivedDateStr) return false;
  const dateObj = new Date(receivedDateStr);
  const year = dateObj.getFullYear();
  const month = dateObj.getMonth() + 1; // 1-12
  
  // If specific date is selected (YYYY-MM-DD)
  if (filterDate) {
    const fDate = new Date(filterDate);
    if (
      dateObj.getDate() !== fDate.getDate() ||
      dateObj.getMonth() !== fDate.getMonth() ||
      dateObj.getFullYear() !== fDate.getFullYear()
    ) {
      return false;
    }
  }

  // If specific month is selected (1-12)
  if (filterMonth && filterMonth !== 'all') {
    if (month !== parseInt(filterMonth)) return false;
  }

  // If specific year is selected
  if (filterYear && filterYear !== 'all') {
    if (year !== parseInt(filterYear)) return false;
  }

  return true;
}

// 4. ORDER MANAGEMENT
function renderOrders() {
  const searchTerm = document.getElementById('search-order').value.toLowerCase();
  const statusFilter = document.getElementById('filter-status').value;
  const filterDate = document.getElementById('filter-date').value;
  const filterMonth = document.getElementById('filter-month').value;
  const filterYear = document.getElementById('filter-year').value;
  
  const tbody = document.getElementById('orders-table-body');
  tbody.innerHTML = '';

  let filteredOrders = getStoreOrders();

  // Filter by search
  if (searchTerm) {
    filteredOrders = filteredOrders.filter(o => 
      o.customerName.toLowerCase().includes(searchTerm) || 
      o.customerPhone.includes(searchTerm) ||
      o.id.toLowerCase().includes(searchTerm) ||
      (o.shoeInfo || '').toLowerCase().includes(searchTerm)
    );
  }

  // Filter by status
  if (statusFilter !== 'all') {
    filteredOrders = filteredOrders.filter(o => o.status === statusFilter);
  }

  // Filter by day, month, year
  filteredOrders = filteredOrders.filter(o => isDateMatch(o.receivedDate, filterDate, filterMonth, filterYear));

  // Sort: newest first
  filteredOrders.sort((a, b) => new Date(b.receivedDate) - new Date(a.receivedDate));

  if (filteredOrders.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" class="text-center" style="padding: 30px; color: var(--text-light);">Không tìm thấy đơn hàng nào</td></tr>`;
    return;
  }

  filteredOrders.forEach(o => {
    const tr = document.createElement('tr');
    
    // Status badge class
    let statusText = 'Chờ xử lý';
    let badgeClass = 'badge-pending';
    switch (o.status) {
      case 'pending': statusText = 'Chờ xử lý'; badgeClass = 'badge-pending'; break;
      case 'processing': statusText = 'Đang tiến hành'; badgeClass = 'badge-processing'; break;
      case 'completed': statusText = 'Đã hoàn thành'; badgeClass = 'badge-completed'; break;
      case 'paid': statusText = 'Đã thanh toán'; badgeClass = 'badge-paid'; break;
      case 'delivered': statusText = 'Đã giao khách'; badgeClass = 'badge-delivered'; break;
      case 'cancelled': statusText = 'Đã hủy'; badgeClass = 'badge-cancelled'; break;
    }

    const servicesText = o.services.map(s => `${s.name}${s.quantity > 1 ? ` (x${s.quantity})` : ''}`).join(', ');

    const firstImageHtml = o.images && o.images.length > 0 
      ? `<img src="${o.images[0]}" class="table-shoe-thumb" onclick="openLightbox('${o.images[0]}'); event.stopPropagation();" title="Xem ảnh lớn">` 
      : `<div class="table-shoe-thumb-placeholder" title="Chưa có ảnh"><svg viewBox="0 0 24 24"><path d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z" fill="currentColor"/></svg></div>`;

    tr.innerHTML = `
      <td style="font-weight: 700; color: var(--color-brand-brown-dark);">${o.id}</td>
      <td>
        <div>
          <div style="font-weight: 600;">${o.customerName}</div>
          <div style="font-size: 0.8rem; color: var(--text-secondary);">${o.customerPhone}</div>
        </div>
      </td>
      <td>
        <div style="display: flex; align-items: center; gap: 10px;">
          ${firstImageHtml}
          <div style="overflow: hidden;">
            <div style="font-weight: 600; text-overflow: ellipsis; overflow: hidden; white-space: nowrap; max-width: 150px;">${o.shoeInfo || '-'}</div>
            <div style="font-size: 0.8rem; color: var(--text-light); text-overflow: ellipsis; overflow: hidden; white-space: nowrap; max-width: 150px;">${servicesText}</div>
          </div>
        </div>
      </td>
      <td style="font-weight: 700; color: var(--color-brand-gold);">${formatVND(o.totalPrice)}</td>
      <td style="font-size: 0.85rem; color: var(--text-secondary);">${formatDateTime(o.receivedDate)}</td>
      <td><span class="badge ${badgeClass}">${statusText}</span></td>
      <td>
        <div class="action-buttons">
          <button class="action-btn edit" onclick="viewOrderDetail('${o.id}')" title="Xem chi tiết & In hóa đơn">
            <svg viewBox="0 0 24 24"><path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z"/></svg>
          </button>
          <button class="action-btn edit" onclick="copyTrackingLink('${o.id}')" title="Sao chép link tra cứu">
            <svg viewBox="0 0 24 24" style="color: var(--color-brand-gold);"><path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z" fill="currentColor"/></svg>
          </button>
          <button class="action-btn edit" onclick="openContentStudioWithOrder('${o.id}')" title="Sáng tạo Content & Ảnh Fanpage" style="color: var(--color-brand-gold);">
            <svg viewBox="0 0 24 24"><path d="M12 3c-4.97 0-9 4.03-9 9 0 2.12.74 4.07 1.97 5.61L4.35 21l3.56-.63C9.37 20.73 10.64 21 12 21c4.97 0 9-4.03 9-9s-4.03-9-9-9zm-1 14h-2v-2h2v2zm0-4h-2V7h2v6z" fill="currentColor"/></svg>
          </button>
          <button class="action-btn edit" onclick="openOrderModal('${o.id}')" title="Chỉnh sửa đơn hàng">
            <svg viewBox="0 0 24 24"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg>
          </button>
          ${['pending', 'processing', 'completed'].includes(o.status) ? `
            <button class="action-btn edit" onclick="quickPayOrderFromTable('${o.id}')" title="Thanh toán nhanh" style="color: var(--status-paid-text);">
              <svg viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1.41 16.09V20h-2.68v-1.92c-1.94-.28-3.57-1.49-3.73-3.48h2.09c.12.96.99 1.54 1.64 1.54.91 0 1.62-.51 1.62-1.39 0-1-.61-1.36-2.09-1.84-1.98-.64-3.58-1.47-3.58-3.69 0-1.82 1.39-3.13 3.32-3.44V4h2.68v1.9c1.62.24 3.01 1.34 3.26 3.19h-2.06c-.22-.84-.81-1.33-1.55-1.33-.86 0-1.42.49-1.42 1.15 0 .84.58 1.19 1.99 1.69 2.11.75 3.68 1.56 3.68 3.82 0 1.91-1.41 3.23-3.67 3.51z" fill="currentColor"/></svg>
            </button>
          ` : ''}
          ${state.currentUser.role === 'admin' ? `
            <button class="action-btn delete" onclick="deleteOrder('${o.id}')" title="Xóa đơn hàng">
              <svg viewBox="0 0 24 24"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
            </button>
          ` : ''}
        </div>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

// Load services into form checklist
function populateServiceSelector(selectedServices = []) {
  const container = document.getElementById('form-services-selector');
  container.innerHTML = '';

  state.services.forEach(s => {
    const existingSelect = selectedServices.find(selected => selected.id === s.id);
    const isChecked = !!existingSelect;
    const quantity = existingSelect ? (existingSelect.quantity || 1) : 1;
    const price = existingSelect ? (existingSelect.price || s.defaultPrice) : s.defaultPrice;

    const div = document.createElement('div');
    div.className = `service-select-item ${isChecked ? 'selected' : ''}`;
    div.setAttribute('data-id', s.id);
    div.setAttribute('data-name', s.name);
    
    div.innerHTML = `
      <div class="service-select-info">
        <span class="service-select-name">${s.name}</span>
        <span class="service-select-cat">${s.category} (${s.priceRange})</span>
      </div>
      <div class="service-controls-wrapper" style="display: flex; align-items: center; gap: 12px;">
        <div class="service-qty-control" onclick="event.stopPropagation()">
          <span style="font-size: 0.75rem; color: var(--text-secondary); font-weight: 700;">Đôi:</span>
          <input type="number" class="service-qty-input" value="${quantity}" min="1">
        </div>
        
        <div style="display: flex; align-items: center;">
          <span class="service-select-price-static">${formatVND(price)}</span>
          
          <div class="service-price-control" onclick="event.stopPropagation()">
            <span style="font-size: 0.75rem; color: var(--text-secondary); font-weight: 700;">Giá:</span>
            <input type="number" class="service-price-input" value="${price}" min="0">
            <span style="font-size: 0.75rem; font-weight: 700; color: var(--color-brand-brown);">đ</span>
          </div>
        </div>
      </div>
    `;

    div.addEventListener('click', () => {
      div.classList.toggle('selected');
      calculateOrderFormTotal();
    });

    const qtyInput = div.querySelector('.service-qty-input');
    qtyInput.addEventListener('change', calculateOrderFormTotal);
    qtyInput.addEventListener('input', calculateOrderFormTotal);
    qtyInput.addEventListener('click', (e) => e.stopPropagation());
    qtyInput.addEventListener('keyup', (e) => e.stopPropagation());

    const priceInput = div.querySelector('.service-price-input');
    priceInput.addEventListener('input', (e) => {
      const val = parseInt(e.target.value) || 0;
      div.querySelector('.service-select-price-static').textContent = formatVND(val);
      calculateOrderFormTotal();
    });
    priceInput.addEventListener('change', calculateOrderFormTotal);
    priceInput.addEventListener('click', (e) => e.stopPropagation());
    priceInput.addEventListener('keyup', (e) => e.stopPropagation());

    container.appendChild(div);
  });
}

function calculateOrderFormTotal() {
  let total = 0;
  document.querySelectorAll('#form-services-selector .service-select-item.selected').forEach(item => {
    const priceInput = item.querySelector('.service-price-input');
    const price = parseInt(priceInput.value) || 0;
    const qtyInput = item.querySelector('.service-qty-input');
    const qty = parseInt(qtyInput.value) || 1;
    total += price * qty;
  });
  document.getElementById('order-total-price').value = total;
}

function openOrderModal(orderId = null) {
  const modal = document.getElementById('order-modal');
  const title = document.getElementById('order-modal-title');
  const form = document.getElementById('order-form');
  
  form.reset();
  state.currentEditingOrder = null;
  
  // Reset temporary image arrays
  state.tempSelectedFiles = [];
  state.tempExistingImages = [];
  const progressContainer = document.getElementById('upload-progress-container');
  if (progressContainer) progressContainer.style.display = 'none';

  if (orderId) {
    // Edit Order
    state.currentEditingOrder = state.orders.find(o => o.id === orderId);
    title.textContent = `Chỉnh Sửa Đơn Hàng ${orderId}`;
    
    // Fill form
    const idInput = document.getElementById('order-id-input');
    if (idInput) idInput.value = state.currentEditingOrder.id;
    document.getElementById('order-cust-name').value = state.currentEditingOrder.customerName;
    document.getElementById('order-cust-phone').value = state.currentEditingOrder.customerPhone;
    document.getElementById('order-shoe-info').value = state.currentEditingOrder.shoeInfo;
    document.getElementById('order-notes').value = state.currentEditingOrder.notes;
    document.getElementById('order-status').value = state.currentEditingOrder.status;
    document.getElementById('order-total-price').value = state.currentEditingOrder.totalPrice;
    
    // Load existing images
    state.tempExistingImages = [...(state.currentEditingOrder.images || [])];
    
    // Status selection visibility
    document.getElementById('status-form-group').style.display = 'block';
    
    // Populate services selector and preselect
    populateServiceSelector(state.currentEditingOrder.services);
  } else {
    // New Order
    title.textContent = 'Thêm Đơn Hàng Mới';
    const idInput = document.getElementById('order-id-input');
    if (idInput) idInput.value = generateNextOrderIdForStore();
    document.getElementById('status-form-group').style.display = 'block'; // Show status dropdown
    document.getElementById('order-status').value = 'pending'; // Default status
    populateServiceSelector([]);
  }

  renderOrderFormImagesPreview();
  modal.classList.add('active');
}

function closeOrderModal() {
  // Revoke preview object URLs to free memory
  state.tempSelectedFiles.forEach(item => {
    URL.revokeObjectURL(item.previewUrl);
  });
  state.tempSelectedFiles = [];
  state.tempExistingImages = [];
  document.getElementById('order-modal').classList.remove('active');
}

async function handleOrderSubmit(e) {
  e.preventDefault();
  
  const custName = document.getElementById('order-cust-name').value.trim();
  const custPhone = document.getElementById('order-cust-phone').value.trim();
  const shoeInfo = document.getElementById('order-shoe-info').value.trim();
  const notes = document.getElementById('order-notes').value.trim();
  const totalPrice = parseInt(document.getElementById('order-total-price').value) || 0;
  
  // Selected services
  const selectedServices = [];
  document.querySelectorAll('#form-services-selector .service-select-item.selected').forEach(item => {
    const qtyInput = item.querySelector('.service-qty-input');
    const qty = parseInt(qtyInput.value) || 1;
    const priceInput = item.querySelector('.service-price-input');
    const price = parseInt(priceInput.value) || 0;
    selectedServices.push({
      id: item.getAttribute('data-id'),
      name: item.getAttribute('data-name'),
      price: price,
      quantity: qty
    });
  });

  if (selectedServices.length === 0) {
    alert('Vui lòng chọn ít nhất một dịch vụ!');
    return;
  }

  // 1. Determine Order ID
  const rawOrderIdInput = (document.getElementById('order-id-input')?.value || '').trim().toUpperCase();
  let orderId = rawOrderIdInput || (state.currentEditingOrder ? state.currentEditingOrder.id : generateNextOrderIdForStore());

  if (!state.currentEditingOrder) {
    const isDuplicate = state.orders.some(o => o.id.toLowerCase() === orderId.toLowerCase());
    if (isDuplicate) {
      alert(`⚠️ Mã đơn hàng "${orderId}" đã tồn tại trong hệ thống! Vui lòng nhập mã đơn hàng khác.`);
      return;
    }
  }

  // 2. Perform sequential image compression and uploads
  const submitBtn = e.target.querySelector('button[type="submit"]');
  const originalBtnText = submitBtn.innerHTML;
  submitBtn.disabled = true;
  submitBtn.innerHTML = `<span style="display:inline-block; animation: spin 1s linear infinite; margin-right:6px;">⏳</span>Đang chuẩn bị ảnh...`;

  const progressContainer = document.getElementById('upload-progress-container');
  const progressFill = document.getElementById('upload-progress-fill');
  const progressText = document.getElementById('upload-progress-text');

  const uploadedImageUrls = [...state.tempExistingImages];
  const totalFiles = state.tempSelectedFiles.length;

  if (totalFiles > 0) {
    if (progressContainer) {
      progressContainer.style.display = 'block';
      progressFill.style.width = '0%';
      progressText.textContent = '0%';
    }

    for (let i = 0; i < totalFiles; i++) {
      const tempItem = state.tempSelectedFiles[i];
      submitBtn.innerHTML = `Đang tải ảnh ${i + 1}/${totalFiles}...`;

      try {
        // Compress the image
        const compressed = await compressImage(tempItem.file);
        
        if (window.storage) {
          // Firebase Storage upload
          const storageRef = window.storage.ref().child(`orders/${orderId}/${Date.now()}-${tempItem.file.name}`);
          const uploadTask = storageRef.put(compressed);
          
          await new Promise((resolveUpload, rejectUpload) => {
            uploadTask.on('state_changed', 
              (snapshot) => {
                const fileProgress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
                const overallProgress = Math.round(((i / totalFiles) * 100) + (fileProgress / totalFiles));
                if (progressFill) progressFill.style.width = `${overallProgress}%`;
                if (progressText) progressText.textContent = `${overallProgress}%`;
              }, 
              (err) => {
                console.error("Firebase Storage Upload Error:", err);
                rejectUpload(err);
              }, 
              async () => {
                const downloadUrl = await uploadTask.snapshot.ref.getDownloadURL();
                uploadedImageUrls.push(downloadUrl);
                resolveUpload();
              }
            );
          });
        } else {
          // LocalStorage fallback (compressed Base64)
          uploadedImageUrls.push(compressed);
          const overallProgress = Math.round(((i + 1) / totalFiles) * 100);
          if (progressFill) progressFill.style.width = `${overallProgress}%`;
          if (progressText) progressText.textContent = `${overallProgress}%`;
        }
      } catch (err) {
        console.error("Compression/Upload failed for file:", tempItem.file.name, err);
      }
    }
  }

  if (progressFill) progressFill.style.width = '100%';
  if (progressText) progressText.textContent = '100%';
  submitBtn.innerHTML = `Đang lưu đơn hàng...`;

  try {
    let orderToSync = null;

    if (state.currentEditingOrder) {
      // Edit
      const order = state.orders.find(o => o.id === state.currentEditingOrder.id);
      if (!order) {
        throw new Error(`Không tìm thấy đơn hàng cần sửa: ${state.currentEditingOrder.id}`);
      }
      order.customerName = custName;
      order.customerPhone = custPhone;
      order.shoeInfo = shoeInfo;
      order.notes = notes;
      order.services = selectedServices;
      order.totalPrice = totalPrice;
      order.images = uploadedImageUrls;
      
      const newStatus = document.getElementById('order-status').value;
      if (newStatus !== order.status) {
        order.status = newStatus;
        if (['completed', 'delivered', 'paid'].includes(newStatus)) {
          order.completedDate = new Date().toISOString();
        } else {
          order.completedDate = null;
        }
      }

      orderToSync = order;
      alert(`Cập nhật đơn hàng ${order.id} thành công!`);
    } else {
      // Create new
      const statusVal = document.getElementById('order-status').value || 'pending';
      const isCompleted = ['completed', 'delivered', 'paid'].includes(statusVal);

      const newOrder = {
        id: orderId,
        storeId: getCurrentStoreId(),
        customerName: custName,
        customerPhone: custPhone,
        shoeInfo: shoeInfo,
        services: selectedServices,
        totalPrice: totalPrice,
        status: statusVal,
        notes: notes,
        images: uploadedImageUrls,
        receivedDate: new Date().toISOString(),
        completedDate: isCompleted ? new Date().toISOString() : null,
        staffId: state.currentUser ? state.currentUser.id : 'system',
        staffName: state.currentUser ? state.currentUser.name : 'Nhân viên hệ thống'
      };

      state.orders.push(newOrder);
      orderToSync = newOrder;
      alert(`Tạo đơn hàng ${orderId} thành công!`);
    }

    saveState('pb_v2_orders', state.orders);

    // Sync specific order to Firebase Cloud
    if (window.db && orderToSync) {
      window.db.collection('v2_orders').doc(orderToSync.id).set(orderToSync)
        .then(() => console.log(`Synced order ${orderToSync.id} to Firebase V2.`))
        .catch(err => {
          console.error("Error syncing order to Firebase V2:", err);
          alert(`Đồng bộ dữ liệu lên Firebase V2 thất bại (đã lưu tạm trên máy): ${err.message}`);
        });
    }
  } catch (err) {
    console.error("Lỗi khi xử lý lưu đơn hàng:", err);
    alert(`Không thể lưu đơn hàng. Chi tiết lỗi: ${err.message}`);
  } finally {
    // Clear file references
    state.tempSelectedFiles.forEach(item => URL.revokeObjectURL(item.previewUrl));
    state.tempSelectedFiles = [];
    state.tempExistingImages = [];

    submitBtn.disabled = false;
    submitBtn.innerHTML = originalBtnText;
    if (progressContainer) progressContainer.style.display = 'none';

    closeOrderModal();
    renderOrders();
  }
}

function deleteOrder(orderId) {
  if (confirm(`Bạn có chắc chắn muốn xóa đơn hàng ${orderId}?`)) {
    state.orders = state.orders.filter(o => o.id !== orderId);
    saveState('pb_v2_orders', state.orders);
    
    // Delete from Firebase Cloud
    if (window.db) {
      window.db.collection('v2_orders').doc(orderId).delete()
        .then(() => console.log(`Deleted order ${orderId} from Firebase Cloud V2.`))
        .catch(err => console.error("Error deleting order from Firebase V2:", err));
    }
    
    renderOrders();
  }
}

// 5. DETAIL VIEW & RECEIPT PRINT
function viewOrderDetail(orderId) {
  const order = state.orders.find(o => o.id === orderId);
  if (!order) return;

  // Fill in detail modal
  document.getElementById('det-order-id').textContent = order.id;
  
  // Status label
  let statusText = 'Chờ xử lý';
  let badgeClass = 'badge-pending';
  switch (order.status) {
    case 'pending': statusText = 'Chờ xử lý'; badgeClass = 'badge-pending'; break;
    case 'processing': statusText = 'Đang tiến hành'; badgeClass = 'badge-processing'; break;
    case 'completed': statusText = 'Đã hoàn thành'; badgeClass = 'badge-completed'; break;
    case 'paid': statusText = 'Đã thanh toán'; badgeClass = 'badge-paid'; break;
    case 'delivered': statusText = 'Đã giao khách'; badgeClass = 'badge-delivered'; break;
    case 'cancelled': statusText = 'Đã hủy'; badgeClass = 'badge-cancelled'; break;
  }
  
  const statusBadge = document.getElementById('det-status');
  statusBadge.className = `badge ${badgeClass}`;
  statusBadge.textContent = statusText;

  document.getElementById('det-cust-name').textContent = order.customerName;
  document.getElementById('det-cust-phone').textContent = order.customerPhone;
  document.getElementById('det-shoe-info').textContent = order.shoeInfo || '-';
  document.getElementById('det-received-date').textContent = formatDateTime(order.receivedDate);
  document.getElementById('det-completed-date').textContent = formatDateTime(order.completedDate);
  document.getElementById('det-staff').textContent = order.staffName || 'Chưa phân công';
  document.getElementById('det-notes').textContent = order.notes || 'Không có ghi chú';
  document.getElementById('det-total-price').textContent = formatVND(order.totalPrice);

  // Populate services list
  const servicesList = document.getElementById('det-services-list');
  servicesList.innerHTML = '';
  order.services.forEach(s => {
    const qty = s.quantity || 1;
    const li = document.createElement('li');
    li.className = 'receipt-service-item';
    li.innerHTML = `
      <span>${s.name} ${qty > 1 ? `<span style="color: var(--text-secondary); font-weight: 500;">(x${qty})</span>` : ''}</span>
      <span style="font-weight: 600;">${formatVND(s.price * qty)}</span>
    `;
    servicesList.appendChild(li);
  });

  // Prepare printing area data with latest store branding
  updateStoreBrandingUI();
  document.getElementById('print-receipt-id').textContent = order.id;
  document.getElementById('print-date').textContent = formatDateTime(new Date());
  document.getElementById('print-cust-name').textContent = order.customerName;
  document.getElementById('print-cust-phone').textContent = order.customerPhone;
  document.getElementById('print-shoe-info').textContent = order.shoeInfo || '-';
  document.getElementById('print-notes').textContent = order.notes || 'Không có';
  
  const printTableBody = document.getElementById('print-services-body');
  printTableBody.innerHTML = '';
  order.services.forEach(s => {
    const qty = s.quantity || 1;
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${s.name} ${qty > 1 ? `(x${qty})` : ''}</td>
      <td style="text-align: right;">${formatVND(s.price * qty)}</td>
    `;
    printTableBody.appendChild(tr);
  });
  document.getElementById('print-total-price').textContent = formatVND(order.totalPrice);

  // Store for printing trigger
  state.currentEditingOrder = order;

  // Toggle Quick Pay button display
  const payBtn = document.getElementById('btn-detail-pay');
  if (payBtn) {
    if (['pending', 'processing', 'completed'].includes(order.status)) {
      payBtn.style.display = 'inline-flex';
    } else {
      payBtn.style.display = 'none';
    }
  }

  // Open modal
  document.getElementById('detail-modal').classList.add('active');

  // Render detail gallery
  const gallerySection = document.getElementById('det-gallery-section');
  const galleryContainer = document.getElementById('det-images-gallery');
  if (gallerySection && galleryContainer) {
    if (order.images && order.images.length > 0) {
      gallerySection.style.display = 'block';
      galleryContainer.innerHTML = '';
      order.images.forEach(url => {
        const div = document.createElement('div');
        div.className = 'detail-image-wrapper';
        div.innerHTML = `<img src="${url}" class="detail-gallery-img" onclick="openLightbox('${url}')" title="Xem ảnh lớn">`;
        galleryContainer.appendChild(div);
      });
    } else {
      gallerySection.style.display = 'none';
    }
  }
}

function closeDetailModal() {
  document.getElementById('detail-modal').classList.remove('active');
}

function printReceipt() {
  window.print();
}

function quickPayOrder() {
  if (!state.currentEditingOrder) return;
  const orderId = state.currentEditingOrder.id;
  quickPayOrderLogic(orderId);
  closeDetailModal();
}

function quickPayOrderFromTable(orderId) {
  const order = state.orders.find(o => o.id === orderId);
  if (order) {
    if (confirm(`Xác nhận thanh toán cho đơn hàng ${orderId} (${formatVND(order.totalPrice)})?`)) {
      quickPayOrderLogic(orderId);
    }
  }
}

function quickPayOrderLogic(orderId) {
  const order = state.orders.find(o => o.id === orderId);
  if (order) {
    order.status = 'paid';
    order.completedDate = new Date().toISOString();
    saveState('pb_v2_orders', state.orders);

    // Sync status change to Firebase Cloud V2
    if (window.db) {
      window.db.collection('v2_orders').doc(orderId).set(order)
        .then(() => console.log(`Paid status for order ${orderId} synced to Firebase V2.`))
        .catch(err => console.error("Error syncing order to Firebase V2:", err));
    }

    renderOrders();
    if (state.activeView === 'dashboard') {
      renderDashboard();
    }
  }
}

// 6. SERVICE SETTINGS CRUD
function renderServicesList() {
  const grid = document.getElementById('services-grid');
  grid.innerHTML = '';

  getStoreServices().forEach(s => {
    const card = document.createElement('div');
    card.className = 'service-card';
    card.innerHTML = `
      <div>
        <div class="service-card-header">
          <span class="service-card-cat">${s.category}</span>
        </div>
        <h4 class="service-card-title">${s.name}</h4>
        <div style="font-size: 0.82rem; color: var(--text-secondary); margin-bottom: 12px;">Khoảng giá: ${s.priceRange}</div>
      </div>
      <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 14px; padding-top: 12px; border-top: 1px solid var(--border-color);">
        <div class="service-card-price">${formatVND(s.defaultPrice)}</div>
        <div class="service-card-actions" style="margin-top: 0; padding-top: 0; border-top: none;">
          <button class="btn btn-secondary btn-sm" onclick="openServiceModal('${s.id}')">Sửa</button>
          <button class="btn btn-danger btn-sm" onclick="deleteService('${s.id}')">Xóa</button>
        </div>
      </div>
    `;
    grid.appendChild(card);
  });
}

function openServiceModal(serviceId = null) {
  const modal = document.getElementById('service-modal');
  const title = document.getElementById('service-modal-title');
  const form = document.getElementById('service-form');
  
  form.reset();
  state.currentEditingService = null;

  if (serviceId) {
    state.currentEditingService = state.services.find(s => s.id === serviceId);
    title.textContent = 'Chỉnh Sửa Dịch Vụ';
    document.getElementById('service-name').value = state.currentEditingService.name;
    document.getElementById('service-category').value = state.currentEditingService.category;
    document.getElementById('service-price').value = state.currentEditingService.defaultPrice;
    document.getElementById('service-range').value = state.currentEditingService.priceRange;
  } else {
    title.textContent = 'Thêm Dịch Vụ Mới';
  }

  modal.classList.add('active');
}

function closeServiceModal() {
  document.getElementById('service-modal').classList.remove('active');
}

function handleServiceSubmit(e) {
  e.preventDefault();
  
  const name = document.getElementById('service-name').value.trim();
  const category = document.getElementById('service-category').value;
  const price = parseInt(document.getElementById('service-price').value) || 0;
  const range = document.getElementById('service-range').value.trim();

  let serviceToSync = null;

  if (state.currentEditingService) {
    const s = state.services.find(serv => serv.id === state.currentEditingService.id);
    s.name = name;
    s.category = category;
    s.defaultPrice = price;
    s.priceRange = range || `${formatVND(price)}`;
    serviceToSync = s;
    alert('Cập nhật dịch vụ thành công!');
  } else {
    const id = 's-' + Date.now();
    const newService = {
      id: id,
      storeId: getCurrentStoreId(),
      name: name,
      category: category,
      defaultPrice: price,
      priceRange: range || `${formatVND(price)}`
    };
    state.services.push(newService);
    serviceToSync = newService;
    alert('Thêm dịch vụ mới thành công!');
  }

  saveState('pb_v2_services', state.services);

  // Sync service to Firebase Cloud V2
  if (window.db && serviceToSync) {
    window.db.collection('v2_services').doc(serviceToSync.id).set(serviceToSync)
      .then(() => console.log(`Synced service ${serviceToSync.id} to Firebase V2.`))
      .catch(err => console.error("Error syncing service to Firebase V2:", err));
  }

  closeServiceModal();
  renderServicesList();
}

function deleteService(serviceId) {
  if (confirm('Bạn có chắc muốn xóa dịch vụ này? Sẽ không ảnh hưởng đến đơn hàng cũ.')) {
    state.services = state.services.filter(s => s.id !== serviceId);
    saveState('pb_v2_services', state.services);
    
    // Delete from Firebase Cloud V2
    if (window.db) {
      window.db.collection('v2_services').doc(serviceId).delete()
        .then(() => console.log(`Deleted service ${serviceId} from Firebase Cloud V2.`))
        .catch(err => console.error("Error deleting service from Firebase V2:", err));
    }
    
    renderServicesList();
  }
}

// 7. EMPLOYEE MANAGEMENT CRUD
function renderEmployeesList() {
  const grid = document.getElementById('employees-grid');
  if (!grid) return;
  grid.innerHTML = '';

  getStoreEmployees().forEach(u => {
    const card = document.createElement('div');
    card.className = 'employee-card';
    const isAdmin = u.role === 'admin';
    card.innerHTML = `
      <div class="employee-avatar" style="${isAdmin ? 'background: var(--color-brand-gold); color: #fff;' : ''}">${u.name ? u.name.split(' ').pop().substring(0, 2).toUpperCase() : 'NV'}</div>
      <div class="employee-details">
        <div class="employee-name">${u.name || 'Chưa đặt tên'}</div>
        <div class="employee-email">${u.email}</div>
        <span class="employee-role-badge" style="${isAdmin ? 'background: #FEF3C7; color: #D97706; font-weight: 700;' : ''}">${isAdmin ? '👑 Chủ Cửa Hàng (Admin)' : 'Nhân viên'}</span>
      </div>
      <div style="display: flex; flex-direction: column; gap: 8px; justify-content: center;">
        <button class="btn btn-secondary btn-sm" onclick="openEmployeeModal('${u.id}')">Sửa</button>
        ${!isAdmin && u.id !== 'u-admin' ? `
          <button class="btn btn-danger btn-sm" onclick="deleteEmployee('${u.id}')">Xóa</button>
        ` : ''}
      </div>
    `;
    grid.appendChild(card);
  });
}

function openEmployeeModal(userId = null) {
  const modal = document.getElementById('employee-modal');
  const title = document.getElementById('employee-modal-title');
  const submitBtn = document.getElementById('employee-submit-btn');
  const form = document.getElementById('employee-form');
  const roleSelect = document.getElementById('emp-role');
  
  form.reset();
  state.currentEditingEmployee = null;
  roleSelect.disabled = false;

  if (userId) {
    state.currentEditingEmployee = state.users.find(u => u.id === userId);
    if (!state.currentEditingEmployee) return;

    title.textContent = 'Chỉnh Sửa Tài Khoản';
    submitBtn.textContent = 'Lưu thay đổi';
    
    // Fill in form values
    document.getElementById('emp-name').value = state.currentEditingEmployee.name || '';
    document.getElementById('emp-email').value = state.currentEditingEmployee.email || '';
    document.getElementById('emp-password').value = state.currentEditingEmployee.password || '';
    roleSelect.value = state.currentEditingEmployee.role || 'staff';

    // Do not allow main admin to change their own role to prevent lockout
    if (state.currentEditingEmployee.role === 'admin' || userId === 'u-admin') {
      roleSelect.disabled = true;
    }
  } else {
    title.textContent = 'Thêm Tài Khoản Nhân Viên Mới';
    submitBtn.textContent = 'Tạo tài khoản';
  }

  modal.classList.add('active');
}

function closeEmployeeModal() {
  const roleSelect = document.getElementById('emp-role');
  if (roleSelect) roleSelect.disabled = false;
  const modal = document.getElementById('employee-modal');
  if (modal) modal.classList.remove('active');
}

function handleEmployeeSubmit(e) {
  e.preventDefault();
  const name = document.getElementById('emp-name').value.trim();
  const email = document.getElementById('emp-email').value.trim();
  const password = document.getElementById('emp-password').value;
  const role = document.getElementById('emp-role').value;

  let employeeToSync = null;

  if (state.currentEditingEmployee) {
    // Editing
    const isEmailTaken = state.users.some(u => u.email.toLowerCase() === email.toLowerCase() && u.id !== state.currentEditingEmployee.id);
    if (isEmailTaken) {
      alert('Email này đã tồn tại trong hệ thống!');
      return;
    }

    const u = state.users.find(user => user.id === state.currentEditingEmployee.id);
    if (!u) return;

    u.name = name;
    u.email = email;
    u.password = password;
    
    // Only update role if it wasn't admin
    if (u.role !== 'admin' && u.id !== 'u-admin') {
      u.role = role;
    }

    // If editing self, update currentUser in state and localStorage
    if (state.currentUser && state.currentUser.id === u.id) {
      state.currentUser = { ...u };
      saveState('pb_v2_current_user', state.currentUser);
      updateProfileUI();
    }

    employeeToSync = u;
    alert('Cập nhật tài khoản thành công!');
  } else {
    // Creating
    if (state.users.some(u => u.email.toLowerCase() === email.toLowerCase())) {
      alert('Email này đã tồn tại trong hệ thống!');
      return;
    }

    const newEmp = {
      id: 'u-' + Date.now(),
      storeId: getCurrentStoreId(),
      name: name,
      email: email,
      password: password,
      role: role,
      status: 'active',
      package: state.currentUser?.package || 'yearly',
      packageStatus: 'active',
      expiresAt: state.currentUser?.expiresAt || null,
      createdAt: new Date().toISOString()
    };
    state.users.push(newEmp);
    employeeToSync = newEmp;
    alert('Thêm tài khoản nhân viên thành công!');
  }

  saveState('pb_v2_users', state.users);

  // Sync employee to Firebase Cloud V2
  if (window.db && employeeToSync) {
    window.db.collection('v2_users').doc(employeeToSync.id).set(employeeToSync)
      .then(() => console.log(`Synced user ${employeeToSync.id} to Firebase V2.`))
      .catch(err => console.error("Error syncing user to Firebase V2:", err));
  }

  closeEmployeeModal();
  renderEmployeesList();
}

function deleteEmployee(userId) {
  const target = state.users.find(u => u.id === userId);
  if (target && target.role === 'admin') {
    alert('Không thể xóa tài khoản Quản trị viên (Chủ cửa hàng)!');
    return;
  }

  if (confirm('Bạn có chắc chắn muốn xóa tài khoản này?')) {
    state.users = state.users.filter(u => u.id !== userId);
    saveState('pb_v2_users', state.users);
    
    // Delete from Firebase Cloud V2
    if (window.db) {
      window.db.collection('v2_users').doc(userId).delete()
        .then(() => console.log(`Deleted user ${userId} from Firebase Cloud V2.`))
        .catch(err => console.error("Error deleting user from Firebase V2:", err));
    }
    
    renderEmployeesList();
  }
}

// 8. CUSTOMER MANAGEMENT
function renderCustomers() {
  const searchTerm = document.getElementById('search-customer').value.toLowerCase();
  const tbody = document.getElementById('customers-table-body');
  tbody.innerHTML = '';

  const customerMap = {};
  getStoreOrders().forEach(o => {
    const phone = o.customerPhone.trim();
    if (!phone) return;
    if (!customerMap[phone]) {
      customerMap[phone] = {
        name: o.customerName,
        phone: phone,
        orderCount: 0,
        totalSpent: 0,
        lastOrderDate: o.receivedDate
      };
    }
    customerMap[phone].orderCount++;
    customerMap[phone].totalSpent += o.totalPrice;
    if (new Date(o.receivedDate) > new Date(customerMap[phone].lastOrderDate)) {
      customerMap[phone].lastOrderDate = o.receivedDate;
      customerMap[phone].name = o.customerName;
    }
  });

  let customers = Object.values(customerMap);

  if (searchTerm) {
    customers = customers.filter(c => 
      c.name.toLowerCase().includes(searchTerm) || 
      c.phone.includes(searchTerm)
    );
  }

  customers.sort((a, b) => b.totalSpent - a.totalSpent);

  if (customers.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" class="text-center" style="padding: 30px; color: var(--text-light);">Không tìm thấy khách hàng nào</td></tr>`;
    return;
  }

  customers.forEach(c => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td style="font-weight: 700; color: var(--color-brand-brown-dark);">${c.name}</td>
      <td style="font-weight: 600;">${c.phone}</td>
      <td style="font-weight: 700; text-align: center; color: var(--text-secondary);">${c.orderCount}</td>
      <td style="font-weight: 700; color: var(--color-brand-gold);">${formatVND(c.totalSpent)}</td>
      <td style="font-size: 0.85rem; color: var(--text-secondary);">${formatDateTime(c.lastOrderDate)}</td>
      <td>
        <div class="action-buttons">
          <button class="action-btn edit" onclick="viewCustomerDetail('${c.phone}')" title="Xem lịch sử mua hàng">
            <svg viewBox="0 0 24 24"><path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z"/></svg>
          </button>
        </div>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

function viewCustomerDetail(phone) {
  const customerOrders = getStoreOrders().filter(o => o.customerPhone.trim() === phone.trim());
  if (customerOrders.length === 0) return;

  customerOrders.sort((a, b) => new Date(b.receivedDate) - new Date(a.receivedDate));

  const customerName = customerOrders[0].customerName;
  const totalSpent = customerOrders.reduce((sum, o) => sum + o.totalPrice, 0);

  document.getElementById('cust-det-name').textContent = customerName;
  document.getElementById('cust-det-phone').textContent = phone;
  document.getElementById('cust-det-orders-count').textContent = customerOrders.length;
  document.getElementById('cust-det-spent').textContent = formatVND(totalSpent);

  const tbody = document.getElementById('cust-det-orders-table-body');
  tbody.innerHTML = '';

  customerOrders.forEach(o => {
    const tr = document.createElement('tr');
    
    let statusText = 'Chờ xử lý';
    let badgeClass = 'badge-pending';
    switch (o.status) {
      case 'pending': statusText = 'Chờ xử lý'; badgeClass = 'badge-pending'; break;
      case 'processing': statusText = 'Đang tiến hành'; badgeClass = 'badge-processing'; break;
      case 'completed': statusText = 'Đã hoàn thành'; badgeClass = 'badge-completed'; break;
      case 'paid': statusText = 'Đã thanh toán'; badgeClass = 'badge-paid'; break;
      case 'delivered': statusText = 'Đã giao khách'; badgeClass = 'badge-delivered'; break;
      case 'cancelled': statusText = 'Đã hủy'; badgeClass = 'badge-cancelled'; break;
    }

    tr.innerHTML = `
      <td style="font-weight: 700; color: var(--color-brand-brown-dark);">${o.id}</td>
      <td>
        <div style="font-weight: 600;">${o.shoeInfo || '-'}</div>
        <div style="font-size: 0.8rem; color: var(--text-light);">${o.services.map(s => s.name).join(', ')}</div>
      </td>
      <td style="font-weight: 700; color: var(--color-brand-gold);">${formatVND(o.totalPrice)}</td>
      <td style="font-size: 0.8rem; color: var(--text-secondary);">${formatDateTime(o.receivedDate)}</td>
      <td><span class="badge ${badgeClass}">${statusText}</span></td>
      <td>
        <button class="action-btn edit" onclick="closeCustomerDetailModal(); viewOrderDetail('${o.id}')" title="Xem chi tiết đơn hàng">
          <svg viewBox="0 0 24 24"><path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z"/></svg>
        </button>
      </td>
    `;
    tbody.appendChild(tr);
  });

  document.getElementById('customer-detail-modal').classList.add('active');
}

function closeCustomerDetailModal() {
  document.getElementById('customer-detail-modal').classList.remove('active');
}

// 9. DASHBOARD / ANALYTICS CHARTS (PURE HTML5 CANVAS)
function renderDashboard() {
  const dbFilterDate = document.getElementById('db-filter-date').value;
  const dbFilterMonth = document.getElementById('db-filter-month').value;
  const dbFilterYear = document.getElementById('db-filter-year').value;

  // Filter orders based on day, month, year
  const filteredOrders = getStoreOrders().filter(o => isDateMatch(o.receivedDate, dbFilterDate, dbFilterMonth, dbFilterYear));

  // Statistics Calculations
  const totalOrders = filteredOrders.length;
  const completedOrders = filteredOrders.filter(o => ['completed', 'delivered', 'paid'].includes(o.status)).length;
  const activeOrders = filteredOrders.filter(o => ['pending', 'processing'].includes(o.status)).length;
  
  const expectedRevenue = filteredOrders
    .filter(o => o.status !== 'cancelled')
    .reduce((sum, o) => sum + o.totalPrice, 0);

  const grossRealizedRevenue = filteredOrders
    .filter(o => ['paid', 'delivered'].includes(o.status))
    .reduce((sum, o) => sum + o.totalPrice, 0);

  // Filter expenses matching dashboard period
  const filteredExpenses = getStoreExpenses().filter(e => isDateMatch(e.date, dbFilterDate, dbFilterMonth, dbFilterYear));
  const totalExpenses = filteredExpenses.reduce((sum, e) => sum + Number(e.amount || 0), 0);

  // Expense deduction mode: 'gross' (default: chưa trừ chi phí) vs 'net' (đã trừ chi phí)
  const expenseModeEl = document.getElementById('db-filter-expense-mode');
  const isNetMode = expenseModeEl && expenseModeEl.value === 'net';

  const displayRealizedRevenue = isNetMode ? (grossRealizedRevenue - totalExpenses) : grossRealizedRevenue;

  // Update DOM stats
  document.getElementById('stat-total-orders').textContent = totalOrders;
  document.getElementById('stat-active-orders').textContent = activeOrders;
  document.getElementById('stat-completed-orders').textContent = completedOrders;
  document.getElementById('stat-revenue-expected').textContent = formatVND(expectedRevenue);

  const expStat = document.getElementById('stat-total-expenses');
  if (expStat) expStat.textContent = formatVND(totalExpenses);

  const lblRealized = document.getElementById('lbl-stat-revenue-realized');
  if (lblRealized) {
    lblRealized.textContent = isNetMode ? 'Doanh thu thực nhận (Đã trừ chi phí)' : 'Doanh thu thực nhận (Chưa trừ chi phí)';
  }

  const realizedStat = document.getElementById('stat-revenue-realized');
  if (realizedStat) {
    realizedStat.textContent = formatVND(displayRealizedRevenue);
    if (isNetMode) {
      realizedStat.style.color = displayRealizedRevenue >= 0 ? 'var(--status-completed-text)' : '#EF4444';
    } else {
      realizedStat.style.color = 'var(--status-completed-text)';
    }
  }

  // Render Canvas Charts using the filtered list
  drawRevenueTrendChart(filteredOrders);
  drawPopularServicesChart(filteredOrders);
}

function drawRevenueTrendChart(filteredOrders) {
  const canvas = document.getElementById('chart-revenue');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  
  // Set dimensions dynamically based on container
  const rect = canvas.parentNode.getBoundingClientRect();
  canvas.width = rect.width;
  canvas.height = 260;

  const width = canvas.width;
  const height = canvas.height;
  const padding = 50;

  ctx.clearRect(0, 0, width, height);

  const dbFilterMonth = document.getElementById('db-filter-month').value;
  const dbFilterYear = document.getElementById('db-filter-year').value;

  let dataPoints = [];

  if (dbFilterMonth !== 'all' && dbFilterYear !== 'all') {
    // Show daily revenue for that month
    const year = parseInt(dbFilterYear);
    const month = parseInt(dbFilterMonth);
    const daysInMonth = new Date(year, month, 0).getDate();
    
    for (let day = 1; day <= daysInMonth; day++) {
      dataPoints.push({
        dayNum: day,
        label: `${day}`,
        expected: 0,
        realized: 0
      });
    }

    filteredOrders.forEach(o => {
      // Map based on receivedDate for expected, completedDate for realized
      const rDate = new Date(o.receivedDate);
      if (o.status !== 'cancelled' && rDate.getFullYear() === year && (rDate.getMonth() + 1) === month) {
        const dayData = dataPoints.find(dp => dp.dayNum === rDate.getDate());
        if (dayData) dayData.expected += o.totalPrice;
      }
      
      if (['paid', 'delivered'].includes(o.status) && o.completedDate) {
        const cDate = new Date(o.completedDate);
        if (cDate.getFullYear() === year && (cDate.getMonth() + 1) === month) {
          const dayData = dataPoints.find(dp => dp.dayNum === cDate.getDate());
          if (dayData) dayData.realized += o.totalPrice;
        }
      }
    });
  } else if (dbFilterYear !== 'all') {
    // Show monthly revenue for that year
    const year = parseInt(dbFilterYear);
    for (let m = 1; m <= 12; m++) {
      dataPoints.push({
        monthNum: m,
        label: `T${m}`,
        expected: 0,
        realized: 0
      });
    }

    filteredOrders.forEach(o => {
      const rDate = new Date(o.receivedDate);
      if (o.status !== 'cancelled' && rDate.getFullYear() === year) {
        const monthData = dataPoints.find(dp => dp.monthNum === (rDate.getMonth() + 1));
        if (monthData) monthData.expected += o.totalPrice;
      }
      
      if (['paid', 'delivered'].includes(o.status) && o.completedDate) {
        const cDate = new Date(o.completedDate);
        if (cDate.getFullYear() === year) {
          const monthData = dataPoints.find(dp => dp.monthNum === (cDate.getMonth() + 1));
          if (monthData) monthData.realized += o.totalPrice;
        }
      }
    });
  } else {
    // Default: Last 7 days
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      dataPoints.push({
        dateStr: d.toISOString().split('T')[0],
        label: `${d.getDate()}/${d.getMonth() + 1}`,
        expected: 0,
        realized: 0
      });
    }

    filteredOrders.forEach(o => {
      const rDateStr = o.receivedDate.split('T')[0];
      const rDay = dataPoints.find(d => d.dateStr === rDateStr);
      if (o.status !== 'cancelled' && rDay) {
        rDay.expected += o.totalPrice;
      }
      
      if (['paid', 'delivered'].includes(o.status) && o.completedDate) {
        const cDateStr = o.completedDate.split('T')[0];
        const cDay = dataPoints.find(d => d.dateStr === cDateStr);
        if (cDay) {
          cDay.realized += o.totalPrice;
        }
      }
    });
  }

  const maxRevenue = Math.max(...dataPoints.map(d => Math.max(d.expected, d.realized)), 100000); // min 100k scale

  // Draw Grid Lines & Labels
  ctx.strokeStyle = '#E2E8F0';
  ctx.lineWidth = 1;
  ctx.fillStyle = '#64748B';
  ctx.font = '10px Montserrat';
  ctx.textAlign = 'right';

  const gridSteps = 4;
  for (let i = 0; i <= gridSteps; i++) {
    const val = (maxRevenue / gridSteps) * i;
    const y = height - padding - ((height - 2 * padding) / gridSteps) * i;
    
    ctx.beginPath();
    ctx.moveTo(padding, y);
    ctx.lineTo(width - padding, y);
    ctx.stroke();

    ctx.fillText(formatVND(val).replace('₫', '').trim(), padding - 10, y + 4);
  }

  // Draw X labels
  ctx.textAlign = 'center';
  const pointsCount = dataPoints.length;
  const labelInterval = pointsCount > 15 ? 3 : 1;
  const pointSpacing = (width - 2 * padding) / (pointsCount - 1 || 1);

  dataPoints.forEach((d, idx) => {
    const x = padding + pointSpacing * idx;
    if (idx % labelInterval === 0 || idx === pointsCount - 1) {
      ctx.fillText(d.label, x, height - padding + 20);
    }
  });

  // 1. Plot expected line (dashed, muted slate blue)
  ctx.strokeStyle = '#94A3B8'; // Muted slate blue/gray
  ctx.lineWidth = 2;
  ctx.setLineDash([4, 4]); // dashed line for provisional/expected
  ctx.beginPath();
  
  const expectedPoints = dataPoints.map((d, idx) => {
    const x = padding + pointSpacing * idx;
    const y = height - padding - ((height - 2 * padding) * d.expected) / maxRevenue;
    return { x, y };
  });

  expectedPoints.forEach((pt, idx) => {
    if (idx === 0) {
      ctx.moveTo(pt.x, pt.y);
    } else {
      ctx.lineTo(pt.x, pt.y);
    }
  });
  ctx.stroke();
  ctx.setLineDash([]); // Reset dashed line style

  // 2. Plot realized line (solid, Ocean Blue)
  ctx.strokeStyle = '#0284C7'; // Brand Ocean Blue
  ctx.lineWidth = 3;
  ctx.beginPath();
  
  const realizedPoints = dataPoints.map((d, idx) => {
    const x = padding + pointSpacing * idx;
    const y = height - padding - ((height - 2 * padding) * d.realized) / maxRevenue;
    return { x, y };
  });

  realizedPoints.forEach((pt, idx) => {
    if (idx === 0) {
      ctx.moveTo(pt.x, pt.y);
    } else {
      ctx.lineTo(pt.x, pt.y);
    }
  });
  ctx.stroke();

  // Draw area gradient for realized
  const gradient = ctx.createLinearGradient(0, padding, 0, height - padding);
  gradient.addColorStop(0, 'rgba(2, 132, 199, 0.25)');
  gradient.addColorStop(1, 'rgba(2, 132, 199, 0.0)');
  ctx.fillStyle = gradient;
  
  ctx.beginPath();
  ctx.moveTo(realizedPoints[0].x, height - padding);
  realizedPoints.forEach(pt => ctx.lineTo(pt.x, pt.y));
  ctx.lineTo(realizedPoints[realizedPoints.length - 1].x, height - padding);
  ctx.closePath();
  ctx.fill();

  // Draw points circles if count <= 12
  if (pointsCount <= 12) {
    // Expected circles
    ctx.fillStyle = '#FFFFFF';
    ctx.strokeStyle = '#94A3B8';
    ctx.lineWidth = 2;
    expectedPoints.forEach((pt) => {
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    });

    // Realized circles & labels
    ctx.fillStyle = '#0F172A';
    ctx.strokeStyle = '#0284C7';
    ctx.lineWidth = 2;

    realizedPoints.forEach((pt, idx) => {
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      if (dataPoints[idx].realized > 0) {
        ctx.fillStyle = '#0F172A';
        ctx.font = 'bold 9px Montserrat';
        ctx.fillText(formatVND(dataPoints[idx].realized).replace('₫', '').trim(), pt.x, pt.y - 12);
      }
    });
  }
}

function drawPopularServicesChart(filteredOrders) {
  const canvas = document.getElementById('chart-services');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  const rect = canvas.parentNode.getBoundingClientRect();
  canvas.width = rect.width;
  canvas.height = 260;

  const width = canvas.width;
  const height = canvas.height;
  const padding = 40;

  ctx.clearRect(0, 0, width, height);

  const serviceStats = {};
  filteredOrders.forEach(o => {
    o.services.forEach(s => {
      serviceStats[s.name] = (serviceStats[s.name] || 0) + 1;
    });
  });

  const popular = Object.keys(serviceStats)
    .map(name => ({ name, count: serviceStats[name] }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5); // top 5

  if (popular.length === 0) {
    ctx.fillStyle = '#94A3B8';
    ctx.font = '14px Montserrat';
    ctx.textAlign = 'center';
    ctx.fillText('Chưa có dữ liệu dịch vụ', width / 2, height / 2);
    return;
  }

  // Draw Pie/Doughnut Chart
  const centerX = width / 2;
  const centerY = height / 2 - 10;
  const radius = Math.min(width, height) / 2 - 50;

  let totalCount = popular.reduce((sum, item) => sum + item.count, 0);
  let startAngle = -Math.PI / 2;

  // Harmonious Blue/Teal Theme Palette
  const colors = ['#0284C7', '#2563EB', '#0D9488', '#38BDF8', '#6366F1'];

  // Draw Slices
  popular.forEach((item, idx) => {
    const sliceAngle = (item.count / totalCount) * 2 * Math.PI;
    
    ctx.fillStyle = colors[idx % colors.length];
    ctx.beginPath();
    ctx.moveTo(centerX, centerY);
    ctx.arc(centerX, centerY, radius, startAngle, startAngle + sliceAngle);
    ctx.closePath();
    ctx.fill();

    startAngle += sliceAngle;
  });

  // Draw Inner circle (Doughnut style)
  ctx.fillStyle = '#FFFFFF';
  ctx.beginPath();
  ctx.arc(centerX, centerY, radius * 0.55, 0, Math.PI * 2);
  ctx.fill();

  // Draw Legend at the bottom
  ctx.font = '9px Montserrat';
  ctx.textAlign = 'left';
  
  const legendYStart = height - 35;
  const itemWidth = width / popular.length;

  popular.forEach((item, idx) => {
    const x = itemWidth * idx + 10;
    
    // Color square
    ctx.fillStyle = colors[idx % colors.length];
    ctx.fillRect(x, legendYStart, 8, 8);

    // Label
    ctx.fillStyle = '#334155';
    ctx.fillText(`${item.name.substring(0, 10)}... (${item.count})`, x + 14, legendYStart + 8);
  });
}

// 9. WINDOWS / EVENT HANDLERS INIT
window.addEventListener('DOMContentLoaded', () => {
  // Set default dashboard filters to current month and year
  const now = new Date();
  const currentMonth = now.getMonth() + 1;
  const currentYear = now.getFullYear();

  const dbMonthSelect = document.getElementById('db-filter-month');
  const dbYearSelect = document.getElementById('db-filter-year');
  if (dbMonthSelect) dbMonthSelect.value = currentMonth.toString();
  if (dbYearSelect) {
    let optionExists = false;
    for (let i = 0; i < dbYearSelect.options.length; i++) {
      if (dbYearSelect.options[i].value === currentYear.toString()) {
        optionExists = true;
        break;
      }
    }
    if (!optionExists) {
      const opt = document.createElement('option');
      opt.value = currentYear.toString();
      opt.textContent = currentYear.toString();
      dbYearSelect.appendChild(opt);
    }
    dbYearSelect.value = currentYear.toString();
  }

  initData();
  
  // Navigation listeners
  document.querySelectorAll('.sidebar-menu li').forEach(li => {
    li.addEventListener('click', () => {
      const view = li.getAttribute('data-view');
      if (view) switchView(view);
    });
  });

  // Login & Register forms
  document.getElementById('login-form').addEventListener('submit', handleLogin);
  const regForm = document.getElementById('register-form');
  if (regForm) regForm.addEventListener('submit', handleRegister);
  
  // Order search and filters
  document.getElementById('search-order').addEventListener('input', renderOrders);
  document.getElementById('filter-status').addEventListener('change', renderOrders);
  document.getElementById('filter-date').addEventListener('change', renderOrders);
  document.getElementById('filter-month').addEventListener('change', renderOrders);
  document.getElementById('filter-year').addEventListener('change', renderOrders);

  // Reset order filters
  document.getElementById('btn-reset-order-filters').addEventListener('click', () => {
    document.getElementById('search-order').value = '';
    document.getElementById('filter-status').value = 'all';
    document.getElementById('filter-date').value = '';
    document.getElementById('filter-month').value = 'all';
    document.getElementById('filter-year').value = 'all';
    renderOrders();
  });

  // Customer filters
  const searchCust = document.getElementById('search-customer');
  if (searchCust) {
    searchCust.addEventListener('input', renderCustomers);
  }
  const resetCust = document.getElementById('btn-reset-customer-filters');
  if (resetCust) {
    resetCust.addEventListener('click', () => {
      document.getElementById('search-customer').value = '';
      renderCustomers();
    });
  }

  // Dashboard filters
  document.getElementById('db-filter-date').addEventListener('change', renderDashboard);
  document.getElementById('db-filter-month').addEventListener('change', renderDashboard);
  document.getElementById('db-filter-year').addEventListener('change', renderDashboard);
  if (document.getElementById('db-filter-expense-mode')) {
    document.getElementById('db-filter-expense-mode').addEventListener('change', renderDashboard);
  }

  // Reset dashboard filters
  document.getElementById('btn-reset-db-filters').addEventListener('click', () => {
    document.getElementById('db-filter-date').value = '';
    document.getElementById('db-filter-month').value = currentMonth.toString();
    document.getElementById('db-filter-year').value = currentYear.toString();
    if (document.getElementById('db-filter-expense-mode')) {
      document.getElementById('db-filter-expense-mode').value = 'gross';
    }
    renderDashboard();
  });

  // Resize charts on window resize
  window.addEventListener('resize', () => {
    if (state.activeView === 'dashboard') {
      renderDashboard();
    }
  });
});

// 10. PUBLIC ORDER TRACKING & TOAST FUNCTIONS
async function loadPublicTracking(orderId) {
  const trackingContainer = document.getElementById('view-public-tracking');
  if (!trackingContainer) return;
  
  document.getElementById('track-order-id').textContent = orderId;
  
  let order = null;
  
  if (window.db) {
    try {
      const doc = await window.db.collection('v2_orders').doc(orderId).get();
      if (doc.exists) {
        order = doc.data();
      }
    } catch (error) {
      console.error("Error fetching order from Firestore V2 for tracking:", error);
    }
  }
  
  // Fallback to LocalStorage / State if offline or not found
  if (!order) {
    if (state.orders.length === 0) {
      loadFromLocalStorage();
    }
    order = state.orders.find(o => o.id.toLowerCase() === orderId.toLowerCase());
  }
  
  if (!order) {
    displayTrackingError(orderId, "Không tìm thấy đơn hàng này trên hệ thống. Vui lòng kiểm tra lại mã đơn hàng hoặc liên hệ hotline để được hỗ trợ.");
    return;
  }
  
  renderTrackingInfo(order);
}

function displayTrackingError(orderId, message) {
  const card = document.querySelector('#view-public-tracking .tracking-card');
  if (!card) return;
  
  card.innerHTML = `
    <div class="tracking-header">
      <div class="brand-logo">
        <h1>SPA GIÀY</h1>
        <p>SHOE SPA & REPAIR</p>
      </div>
      <div class="tracking-title-block">
        <h2>TRA CỨU TIẾN ĐỘ ĐƠN HÀNG</h2>
        <p>Mã đơn hàng: <span style="font-weight: 700; color: var(--status-cancelled-text);">${orderId}</span></p>
      </div>
    </div>
    
    <div class="text-center" style="padding: 40px 20px;">
      <svg viewBox="0 0 24 24" style="width: 64px; height: 64px; fill: var(--status-cancelled-text); margin-bottom: 16px;">
        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/>
      </svg>
      <h3 style="color: var(--color-brand-brown-dark); margin-bottom: 8px; font-weight: 700;">Không tìm thấy thông tin</h3>
      <p style="color: var(--text-secondary); margin-bottom: 24px; max-width: 400px; margin-left: auto; margin-right: auto;">${message}</p>
      <div style="display: flex; justify-content: center; gap: 12px;">
        <a href="tel:0906227512" class="btn btn-primary">Gọi Hotline Hỗ Trợ</a>
        <a href="https://zalo.me/0906227512" target="_blank" class="btn btn-secondary">Nhắn Zalo Shop</a>
      </div>
    </div>
  `;
}

function renderTrackingInfo(order) {
  document.getElementById('track-order-id').textContent = order.id;
  document.getElementById('track-cust-name').textContent = order.customerName;
  
  // Mask customer phone for security/privacy
  const rawPhone = order.customerPhone || '';
  let maskedPhone = rawPhone;
  if (rawPhone.length >= 8) {
    maskedPhone = rawPhone.substring(0, 4) + ' ••• ' + rawPhone.substring(rawPhone.length - 3);
  }
  document.getElementById('track-cust-phone').textContent = maskedPhone;
  
  document.getElementById('track-shoe-info').textContent = order.shoeInfo || 'Không có ghi chú model';
  document.getElementById('track-received-date').textContent = formatDateTime(order.receivedDate);
  document.getElementById('track-notes').textContent = order.notes || 'Không có ghi chú thêm.';
  document.getElementById('track-total-price').textContent = formatVND(order.totalPrice);
  
  // Populate services
  const servicesList = document.getElementById('track-services-list');
  servicesList.innerHTML = '';
  order.services.forEach(s => {
    const qty = s.quantity || 1;
    const li = document.createElement('li');
    li.innerHTML = `
      <span>${s.name} ${qty > 1 ? `<span style="color: var(--text-light); font-weight: 500;">(x${qty})</span>` : ''}</span>
      <span style="font-weight: 600;">${formatVND(s.price * qty)}</span>
    `;
    servicesList.appendChild(li);
  });
  
  // Stepper timeline
  const stepPending = document.getElementById('step-pending');
  const stepProcessing = document.getElementById('step-processing');
  const stepCompleted = document.getElementById('step-completed');
  const stepDelivered = document.getElementById('step-delivered');
  
  const line1 = document.getElementById('line-1');
  const line2 = document.getElementById('line-2');
  const line3 = document.getElementById('line-3');
  
  const cancelledBanner = document.getElementById('track-cancelled-banner');
  const stepperContainer = document.querySelector('.tracking-stepper-container');
  
  // Reset
  [stepPending, stepProcessing, stepCompleted, stepDelivered].forEach(node => {
    node.classList.remove('active', 'completed');
  });
  [line1, line2, line3].forEach(line => {
    line.classList.remove('completed');
  });
  
  let statusText = 'Chờ xử lý';
  let badgeClass = 'badge-pending';
  
  if (order.status === 'cancelled') {
    statusText = 'Đã hủy';
    badgeClass = 'badge-cancelled';
    cancelledBanner.style.display = 'flex';
    stepperContainer.style.display = 'none';
  } else {
    cancelledBanner.style.display = 'none';
    stepperContainer.style.display = 'block';
    
    // Steps: 1: pending, 2: processing, 3: completed/paid, 4: delivered
    if (order.status === 'pending') {
      statusText = 'Chờ xử lý';
      badgeClass = 'badge-pending';
      stepPending.classList.add('active');
    } else if (order.status === 'processing') {
      statusText = 'Đang tiến hành';
      badgeClass = 'badge-processing';
      
      stepPending.classList.add('completed');
      line1.classList.add('completed');
      stepProcessing.classList.add('active');
    } else if (order.status === 'completed') {
      statusText = 'Đã hoàn thành';
      badgeClass = 'badge-completed';
      
      stepPending.classList.add('completed');
      line1.classList.add('completed');
      stepProcessing.classList.add('completed');
      line2.classList.add('completed');
      stepCompleted.classList.add('active');
    } else if (order.status === 'paid') {
      statusText = 'Đã thanh toán (Chờ nhận)';
      badgeClass = 'badge-paid';
      
      stepPending.classList.add('completed');
      line1.classList.add('completed');
      stepProcessing.classList.add('completed');
      line2.classList.add('completed');
      stepCompleted.classList.add('active');
    } else if (order.status === 'delivered') {
      statusText = 'Đã giao khách';
      badgeClass = 'badge-delivered';
      
      stepPending.classList.add('completed');
      line1.classList.add('completed');
      stepProcessing.classList.add('completed');
      line2.classList.add('completed');
      stepCompleted.classList.add('completed');
      line3.classList.add('completed');
      stepDelivered.classList.add('active');
    }
  }
  
  const statusBadge = document.getElementById('track-status-badge');
  statusBadge.textContent = statusText;
  statusBadge.className = `badge ${badgeClass}`;

  // Render public tracking image gallery
  const trackGalleryCard = document.getElementById('track-gallery-card');
  const trackGalleryContainer = document.getElementById('track-images-gallery');
  if (trackGalleryCard && trackGalleryContainer) {
    if (order.images && order.images.length > 0) {
      trackGalleryCard.style.display = 'block';
      trackGalleryContainer.innerHTML = '';
      order.images.forEach(url => {
        const div = document.createElement('div');
        div.className = 'detail-image-wrapper';
        div.innerHTML = `<img src="${url}" class="detail-gallery-img" onclick="openLightbox('${url}')" title="Click để phóng to">`;
        trackGalleryContainer.appendChild(div);
      });
    } else {
      trackGalleryCard.style.display = 'none';
    }
  }
}

// Image Selection & Compression & Lightbox Helpers
function handleOrderImagesSelect(e) {
  const files = Array.from(e.target.files);
  if (files.length === 0) return;
  
  files.forEach(file => {
    const previewUrl = URL.createObjectURL(file);
    const tempId = 'temp-' + Date.now() + '-' + Math.random().toString(36).substring(2, 7);
    state.tempSelectedFiles.push({
      id: tempId,
      file: file,
      previewUrl: previewUrl
    });
  });
  
  renderOrderFormImagesPreview();
  e.target.value = '';
}

function renderOrderFormImagesPreview() {
  const container = document.getElementById('order-images-preview-container');
  if (!container) return;
  container.innerHTML = '';
  
  // Render existing images
  state.tempExistingImages.forEach((url, index) => {
    const div = document.createElement('div');
    div.className = 'image-preview-item';
    div.innerHTML = `
      <img src="${url}">
      <button type="button" class="image-preview-delete" onclick="deleteExistingOrderImage(${index})">&times;</button>
    `;
    container.appendChild(div);
  });
  
  // Render new temporary selected images
  state.tempSelectedFiles.forEach(item => {
    const div = document.createElement('div');
    div.className = 'image-preview-item';
    div.innerHTML = `
      <img src="${item.previewUrl}">
      <button type="button" class="image-preview-delete" onclick="deleteTempOrderImage('${item.id}')">&times;</button>
    `;
    container.appendChild(div);
  });
}

function deleteExistingOrderImage(index) {
  state.tempExistingImages.splice(index, 1);
  renderOrderFormImagesPreview();
}

function deleteTempOrderImage(id) {
  const index = state.tempSelectedFiles.findIndex(item => item.id === id);
  if (index !== -1) {
    URL.revokeObjectURL(state.tempSelectedFiles[index].previewUrl);
    state.tempSelectedFiles.splice(index, 1);
  }
  renderOrderFormImagesPreview();
}

function compressImage(file, maxWidth = 700, maxHeight = 700, quality = 0.5) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target.result;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;
        
        if (width > height) {
          if (width > maxWidth) {
            height = Math.round((height * maxWidth) / width);
            width = maxWidth;
          }
        } else {
          if (height > maxHeight) {
            width = Math.round((width * maxHeight) / height);
            height = maxHeight;
          }
        }
        
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        
        if (window.storage) {
          canvas.toBlob((blob) => {
            resolve(blob);
          }, 'image/jpeg', quality);
        } else {
          resolve(canvas.toDataURL('image/jpeg', quality));
        }
      };
    };
  });
}

function openLightbox(url) {
  const modal = document.getElementById('lightbox-modal');
  const img = document.getElementById('lightbox-img');
  if (modal && img) {
    img.src = url;
    modal.classList.add('active');
  }
}

function closeLightbox() {
  const modal = document.getElementById('lightbox-modal');
  if (modal) {
    modal.classList.remove('active');
  }
}

function copyTrackingLink(orderId) {
  if (!orderId) return;
  
  const url = `${window.location.origin}${window.location.pathname}?order=${orderId}`;
  
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(url)
      .then(() => {
        showToast(`Đã sao chép link tra cứu đơn hàng ${orderId}!`);
      })
      .catch(err => {
        console.error('Failed to copy text using Clipboard API:', err);
        fallbackCopyText(url, orderId);
      });
  } else {
    fallbackCopyText(url, orderId);
  }
}

function fallbackCopyText(text, orderId) {
  const textArea = document.createElement("textarea");
  textArea.value = text;
  textArea.style.top = "0";
  textArea.style.left = "0";
  textArea.style.position = "fixed";
  document.body.appendChild(textArea);
  textArea.focus();
  textArea.select();
  
  try {
    const successful = document.execCommand('copy');
    if (successful) {
      showToast(`Đã sao chép link tra cứu đơn hàng ${orderId}!`);
    } else {
      alert(`Link tra cứu của bạn: ${text}`);
    }
  } catch (err) {
    console.error('Fallback copy text failed:', err);
    alert(`Link tra cứu của bạn: ${text}`);
  }
  
  document.body.removeChild(textArea);
}

function showToast(message) {
  const container = document.getElementById('toast-container');
  if (!container) return;
  
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.innerHTML = `
    <svg viewBox="0 0 24 24" style="width: 18px; height: 18px; fill: var(--color-brand-gold);"><path d="M9 16.2L4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4L9 16.2z" fill="currentColor"/></svg>
    <span>${message}</span>
  `;
  
  container.appendChild(toast);
  
  setTimeout(() => {
    toast.remove();
  }, 3000);
}

// ================= 7. CONTENT & GRAPHIC FANPAGE STUDIO =================
const studioState = {
  sourceMode: 'order', // 'order' | 'custom'
  selectedOrderId: '',
  images: [], // array of base64 or URL strings
  preset: 'before_after', // 'before_after' | 'price_service' | 'feedback' | 'promotion' | 'story'
  tone: 'friendly', // 'friendly' | 'professional' | 'viral' | 'luxury'
  graphicTemplate: 'before_after_split' // 'before_after_split' | 'showcase_badge' | 'customer_feedback' | 'promo_banner'
};

function renderContentStudio() {
  // 1. Populate orders dropdown
  const orderSelect = document.getElementById('studio-order-select');
  if (orderSelect) {
    const currentVal = orderSelect.value;
    orderSelect.innerHTML = '<option value="">-- Chọn một đơn hàng --</option>';
    
    // Sort orders newest first
    const sortedOrders = [...state.orders].sort((a, b) => new Date(b.receivedDate) - new Date(a.receivedDate));
    sortedOrders.forEach(o => {
      const opt = document.createElement('option');
      opt.value = o.id;
      const servicesText = o.services ? o.services.map(s => s.name).join(', ') : '';
      opt.textContent = `${o.id} - ${o.customerName} (${o.shoeInfo || 'Giày'} - ${servicesText})`;
      orderSelect.appendChild(opt);
    });

    if (studioState.selectedOrderId && state.orders.some(o => o.id === studioState.selectedOrderId)) {
      orderSelect.value = studioState.selectedOrderId;
      onStudioOrderSelect(studioState.selectedOrderId);
    } else if (currentVal) {
      orderSelect.value = currentVal;
    }
  }

  // Ensure current mode UI is set
  switchContentSource(studioState.sourceMode || 'order');
  renderContentCanvas();
}

function openContentStudioWithOrder(orderId) {
  studioState.sourceMode = 'order';
  studioState.selectedOrderId = orderId;
  switchView('content-studio');
}

function createContentFromDetailModal() {
  if (state.currentEditingOrder) {
    const orderId = state.currentEditingOrder.id;
    closeDetailModal();
    openContentStudioWithOrder(orderId);
  }
}

function switchContentSource(mode) {
  studioState.sourceMode = mode;
  const orderTab = document.getElementById('tab-src-order');
  const customTab = document.getElementById('tab-src-custom');
  const orderBlock = document.getElementById('studio-src-order-block');
  const customBlock = document.getElementById('studio-src-custom-block');
  const promoBlock = document.getElementById('studio-src-promo-block');

  if (mode === 'order') {
    if (orderTab) orderTab.classList.add('active');
    if (customTab) customTab.classList.remove('active');
    if (orderBlock) orderBlock.style.display = 'block';
    if (customBlock) customBlock.style.display = 'none';
    if (promoBlock) promoBlock.style.display = 'none';

    const orderId = document.getElementById('studio-order-select').value;
    if (orderId) {
      onStudioOrderSelect(orderId);
    }
  } else {
    if (customTab) customTab.classList.add('active');
    if (orderTab) orderTab.classList.remove('active');
    if (orderBlock) orderBlock.style.display = 'none';

    // Auto-select Before & After preset and template when switching to custom mode if not already set
    if (!studioState.preset || studioState.preset === 'before_after') {
      const beforeAfterPresetBtn = document.querySelector('.preset-pill[data-preset="before_after"]');
      if (beforeAfterPresetBtn) selectPresetTemplate(beforeAfterPresetBtn);
    } else {
      updateStudioInputLabelsForPreset(studioState.preset);
    }

    renderStudioImagesPreview();
    generateFanpageCaption();
    renderContentCanvas();
  }
}

function onStudioOrderSelect(orderId) {
  studioState.selectedOrderId = orderId;
  if (!orderId) {
    studioState.images = [];
    renderStudioImagesPreview();
    return;
  }

  const order = state.orders.find(o => o.id === orderId);
  if (!order) return;

  // Auto-fill fields
  document.getElementById('studio-shoe-info').value = order.shoeInfo || '';
  document.getElementById('studio-customer-name').value = order.customerName || '';
  
  const servicesText = order.services ? order.services.map(s => `${s.name}${s.quantity > 1 ? ` (x${s.quantity})` : ''}`).join(' + ') : '';
  document.getElementById('studio-services-text').value = servicesText;
  document.getElementById('studio-price-text').value = formatVND(order.totalPrice || 0);
  document.getElementById('studio-notes-text').value = order.notes || '';

  studioState.images = order.images && order.images.length > 0 ? [...order.images] : [];
  renderStudioImagesPreview();
  
  // Auto generate caption & render canvas
  generateFanpageCaption();
  renderContentCanvas();
}

async function handleStudioBeforeImage(e) {
  const file = e.target.files[0];
  if (!file) return;

  try {
    const compressed = await compressImage(file, 900, 900, 0.85);
    studioState.images[0] = compressed;

    const previewBox = document.getElementById('studio-before-preview-box');
    if (previewBox) {
      previewBox.innerHTML = `<img src="${compressed}" style="width: 100%; height: 100px; object-fit: cover; border-radius: 6px; border: 2px solid #DC2626;">`;
    }
  } catch (err) {
    console.error("Lỗi nén ảnh Before:", err);
  }

  renderStudioImagesPreview();
  generateFanpageCaption();
  renderContentCanvas();
}

async function handleStudioAfterImage(e) {
  const file = e.target.files[0];
  if (!file) return;

  try {
    const compressed = await compressImage(file, 900, 900, 0.85);
    studioState.images[1] = compressed;

    const previewBox = document.getElementById('studio-after-preview-box');
    if (previewBox) {
      previewBox.innerHTML = `<img src="${compressed}" style="width: 100%; height: 100px; object-fit: cover; border-radius: 6px; border: 2px solid #16A34A;">`;
    }
  } catch (err) {
    console.error("Lỗi nén ảnh After:", err);
  }

  renderStudioImagesPreview();
  generateFanpageCaption();
  renderContentCanvas();
}

function renderStudioImagesPreview() {
  const container = document.getElementById('studio-images-preview');
  if (!container) return;

  if (studioState.images.length === 0) {
    container.innerHTML = `<div style="color: var(--text-light); font-size: 0.85rem; font-style: italic;">Chưa có ảnh nào được chọn.</div>`;
    return;
  }

  container.innerHTML = '';
  studioState.images.forEach((url, idx) => {
    const div = document.createElement('div');
    div.className = 'image-preview-item';
    div.innerHTML = `
      <img src="${url}">
      <button type="button" class="image-preview-delete" onclick="removeStudioImage(${idx})">&times;</button>
    `;
    container.appendChild(div);
  });
}

function removeStudioImage(index) {
  studioState.images.splice(index, 1);
  renderStudioImagesPreview();
  renderContentCanvas();
}

async function handleStudioPromoImage(e) {
  const file = e.target.files[0];
  if (!file) return;

  try {
    const compressed = await compressImage(file, 1080, 1080, 0.85);
    studioState.images = [compressed];

    const previewBox = document.getElementById('studio-promo-preview-box');
    if (previewBox) {
      previewBox.innerHTML = `<img src="${compressed}" style="width: 100%; height: 100px; object-fit: cover; border-radius: 6px; border: 2px solid #EAB308;">`;
    }
  } catch (err) {
    console.error("Lỗi nén ảnh Khuyến mãi:", err);
  }

  renderStudioImagesPreview();
  generateFanpageCaption();
  renderContentCanvas();
}

const SHOE_TIPS_DATABASE = {
  yellow_sole: {
    title: 'CÁCH TẨY VẾT Ố VÀNG ĐẾ GIÀY SNEAKER TRẮNG TẠI NHÀ',
    prep: 'Bàn chải mềm, Chanh tươi & Kem đánh răng trắng',
    step1: 'Thoa nhẹ hỗn hợp nước chanh & kem đánh răng lên vết ố vàng',
    step2: 'Dùng bàn chải chà nhẹ nhàng theo chiều kim đồng hồ 3-5 phút',
    note: 'Lau lại bằng khăn ẩm, phủ giấy ăn bọc kín đế khi sấy/phơi'
  },
  odor_remove: {
    title: 'MẸO KHỬ MÙI HÔI GIÀY CẤP TỐC CHỈ TRONG 1 ĐÊM',
    prep: 'Túi trà lọc đã qua sử dụng hoặc Phấn rôm trẻ em',
    step1: 'Đặt 2-3 túi trà khô hoặc rắc chút phấn rôm vào trong lòng giày',
    step2: 'Để qua đêm ở nơi khô ráo, thoáng gió để hút sạch ẩm & mùi hôi',
    note: 'Tháo rời lót giày ra giặt riêng & xịt diệt khuẩn nấm mốc'
  },
  suede_care: {
    title: 'BÍ QUYẾT VỆ SINH GIÀY DA LỘN (SUEDE) KHÔNG XÙ LÔNG',
    prep: 'Bàn chải lông ngựa/lông mềm & Cục tẩy dẻo học sinh',
    step1: 'Chải nhẹ bề mặt da lộn theo MỘT CHIỀU cố định để rũ bùn đất',
    step2: 'Dùng cục tẩy chà nhẹ nhàng lên các vết bẩn khô bám trên da lộn',
    note: 'TUYỆT ĐỐI KHÔNG dùng nước trực tiếp làm giòn da & lem màu'
  },
  rain_waterproof: {
    title: 'XỬ LÝ GIÀY BỊ ƯỚT MƯA TRÁNH BỊ Ố VÀNG & ẨM MỐC',
    prep: 'Khăn bông mềm & Giấy báo trắng hoặc Giấy hút ẩm',
    step1: 'Gột sạch bùn đất bên ngoài, lau khô bằng khăn bông mềm',
    step2: 'Vo tròn giấy báo nhét căng vào lòng giày để hút ẩm & giữ form',
    note: 'Sấy ở chế độ gió mát, không sấy nhiệt nóng làm teo đế cao su'
  },
  scuff_mark: {
    title: 'TẨY VẾT XƯỚC ĐEN TRÊN GIÀY DA TRẮNG CỰC DỄ',
    prep: 'Bông tẩy trang & Nước tẩy trang hoặc Dầu gió xanh',
    step1: 'Thấm chút dung dịch tẩy trang vào bông tẩy trang/bọt biển magic',
    step2: 'Chà nhẹ nhàng lên vết xước đen bám trên thân da hoặc đế giày',
    note: 'Thoa một lớp kem dưỡng mỏng sau khi lau để bảo vệ mặt da'
  }
};

function applyQuickShoeTip(tipId, btn) {
  const tip = SHOE_TIPS_DATABASE[tipId];
  if (!tip) return;

  if (btn) {
    const parent = btn.parentElement;
    if (parent) {
      parent.querySelectorAll('.preset-pill').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    }
  }

  const inputShoe = document.getElementById('studio-shoe-info');
  if (inputShoe) inputShoe.value = tip.title;

  const inputCust = document.getElementById('studio-customer-name');
  if (inputCust) inputCust.value = tip.prep;

  const inputServ = document.getElementById('studio-services-text');
  if (inputServ) inputServ.value = tip.step1;

  const inputPrice = document.getElementById('studio-price-text');
  if (inputPrice) inputPrice.value = tip.step2;

  const inputNotes = document.getElementById('studio-notes-text');
  if (inputNotes) inputNotes.value = tip.note;

  generateFanpageCaption();
  renderContentCanvas();
}

function updateStudioInputLabelsForPreset(preset) {
  const isPromo = (preset === 'promotion');
  const isTips = (preset === 'tips');

  const quickTipsBox = document.getElementById('studio-quick-tips-container');
  if (quickTipsBox) {
    quickTipsBox.style.display = isTips ? 'block' : 'none';
  }

  const lblShoe = document.getElementById('lbl-studio-shoe-info');
  const inputShoe = document.getElementById('studio-shoe-info');

  const lblCust = document.getElementById('lbl-studio-customer-name');
  const inputCust = document.getElementById('studio-customer-name');

  const lblServ = document.getElementById('lbl-studio-services-text');
  const inputServ = document.getElementById('studio-services-text');

  const lblPrice = document.getElementById('lbl-studio-price-text');
  const inputPrice = document.getElementById('studio-price-text');

  const lblNotes = document.getElementById('lbl-studio-notes-text');
  const inputNotes = document.getElementById('studio-notes-text');

  // Clear tip values when switching away from Mẫu 2 (tips mode) so they NEVER leak into other templates!
  if (!isTips && inputShoe) {
    const curVal = inputShoe.value.trim();
    const isTipText = Object.values(SHOE_TIPS_DATABASE).some(t => t.title === curVal) ||
                      curVal.includes('CÁCH TẨY') || curVal.includes('MẸO KHỬ') || 
                      curVal.includes('BÍ QUYẾT') || curVal.includes('XỬ LÝ GIÀY') || 
                      curVal.includes('TẨY VẾT');
    if (isTipText) {
      inputShoe.value = '';
      if (inputCust) inputCust.value = '';
      if (inputServ) inputServ.value = '';
      if (inputPrice) inputPrice.value = '';
      if (inputNotes) inputNotes.value = '';

      // Re-fill from selected order if active
      const orderSelect = document.getElementById('studio-order-select');
      if (orderSelect && orderSelect.value) {
        onStudioOrderSelect();
      }
    }
  }

  if (lblShoe && inputShoe) {
    if (isPromo) {
      lblShoe.textContent = 'Chương trình Khuyến mãi *';
      inputShoe.placeholder = 'Ví dụ: TRI ÂN KHÁCH HÀNG - GIẢM 20%';
    } else if (isTips) {
      lblShoe.textContent = 'Chủ đề Mẹo Vặt Vệ Sinh Giày *';
      inputShoe.placeholder = 'Ví dụ: CÁCH TẨY VẾT Ố VÀNG ĐẾ GIÀY SNEAKER TRẮNG';
    } else {
      lblShoe.textContent = 'Tên / Hiệu / Model Giày';
      inputShoe.placeholder = 'Ví dụ: Nike Air Jordan 1 High';
    }
  }

  if (lblCust && inputCust) {
    if (isPromo) {
      lblCust.textContent = 'Thời gian / Điều kiện áp dụng';
      inputCust.placeholder = 'Ví dụ: Áp dụng từ 01/08 đến 15/08/2026';
    } else if (isTips) {
      lblCust.textContent = 'Dụng cụ / Nguyên liệu chuẩn bị';
      inputCust.placeholder = 'Ví dụ: Bàn chải mềm, Chanh tươi & Kem đánh răng';
    } else {
      lblCust.textContent = 'Tên khách hàng (Tùy chọn)';
      inputCust.placeholder = 'Ví dụ: Anh Tuấn';
    }
  }

  if (lblServ && inputServ) {
    if (isPromo) {
      lblServ.textContent = 'Nội dung Ưu đãi / Dịch vụ áp dụng';
      inputServ.placeholder = 'Ví dụ: Vệ sinh giày chuyên sâu & Repaint đế';
    } else if (isTips) {
      lblServ.textContent = 'Bước 1: Thao tác thực hiện';
      inputServ.placeholder = 'Ví dụ: Thoa nhẹ hỗn hợp chanh & kem đánh răng lên vết ố';
    } else {
      lblServ.textContent = 'Dịch vụ thực hiện';
      inputServ.placeholder = 'Ví dụ: Vệ sinh chuyên sâu + Repaint đế';
    }
  }

  if (lblPrice && inputPrice) {
    if (isPromo) {
      lblPrice.textContent = 'Giá ưu đãi / Mức giảm giá';
      inputPrice.placeholder = 'Ví dụ: Giảm 20% - Chỉ từ 50.000đ';
    } else if (isTips) {
      lblPrice.textContent = 'Bước 2: Thao tác thực hiện';
      inputPrice.placeholder = 'Ví dụ: Dùng bàn chải chà nhẹ theo chiều kim đồng hồ 3-5 phút';
    } else {
      lblPrice.textContent = 'Tổng chi phí / Giá dịch vụ';
      inputPrice.placeholder = 'Ví dụ: 250.000đ';
    }
  }

  if (lblNotes && inputNotes) {
    if (isPromo) {
      lblNotes.textContent = 'Tagline / Khẩu hiệu thu hút';
      inputNotes.placeholder = 'Ví dụ: Giày sạch kính kong đón hè cực chất cùng Phủi Bụi';
    } else if (isTips) {
      lblNotes.textContent = 'Lưu ý quan trọng / Mẹo hay';
      inputNotes.placeholder = 'Ví dụ: Tránh phơi trực tiếp dưới ánh nắng gắt để không bị giòn đế';
    } else {
      lblNotes.textContent = 'Ghi chú tình trạng / Điểm nổi bật';
      inputNotes.placeholder = 'Ví dụ: Ố vàng lâu năm đã được tẩy trắng sáng như mới';
    }
  }

  // Toggle custom upload blocks in custom source mode
  const customBlock = document.getElementById('studio-src-custom-block');
  const promoBlock = document.getElementById('studio-src-promo-block');
  if (studioState.sourceMode === 'custom') {
    if (isPromo || isTips) {
      if (customBlock) customBlock.style.display = 'none';
      if (promoBlock) promoBlock.style.display = 'block';
    } else {
      if (customBlock) customBlock.style.display = 'block';
      if (promoBlock) promoBlock.style.display = 'none';
    }
  } else {
    if (customBlock) customBlock.style.display = 'none';
    if (promoBlock) promoBlock.style.display = 'none';
  }

  // Auto-apply default tip #1 ONLY when switching into tips mode and input is empty
  if (isTips && inputShoe && !inputShoe.value.trim()) {
    const defaultBtn = document.querySelector('#studio-quick-tips-container .preset-pill');
    applyQuickShoeTip('yellow_sole', defaultBtn);
  }
}

const PRESET_TO_GFX_MAP = {
  'before_after': 'before_after_split',
  'tips': 'showcase_badge',
  'price_service': 'showcase_badge',
  'feedback': 'customer_feedback',
  'promotion': 'promo_banner',
  'story': 'showcase_badge',
  'simple_framed': 'simple_framed'
};

const GFX_TO_PRESET_MAP = {
  'before_after_split': 'before_after',
  'showcase_badge': 'tips',
  'customer_feedback': 'feedback',
  'promo_banner': 'promotion',
  'simple_framed': 'simple_framed'
};

function selectPresetTemplate(btn, skipSync = false) {
  document.querySelectorAll('.preset-pill').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  studioState.preset = btn.getAttribute('data-preset');

  if (!skipSync) {
    const matchingGfxTpl = PRESET_TO_GFX_MAP[studioState.preset];
    if (matchingGfxTpl) {
      const gfxCard = document.querySelector(`.graphic-tpl-card[data-tpl="${matchingGfxTpl}"]`);
      if (gfxCard) {
        document.querySelectorAll('.graphic-tpl-card').forEach(c => c.classList.remove('active'));
        gfxCard.classList.add('active');
        studioState.graphicTemplate = matchingGfxTpl;
      }
    }
  }

  updateStudioInputLabelsForPreset(studioState.preset);
  generateFanpageCaption();
  renderContentCanvas();
}

function selectGraphicTemplate(card, skipSync = false) {
  document.querySelectorAll('.graphic-tpl-card').forEach(c => c.classList.remove('active'));
  card.classList.add('active');
  studioState.graphicTemplate = card.getAttribute('data-tpl');

  if (!skipSync) {
    const matchingPreset = GFX_TO_PRESET_MAP[studioState.graphicTemplate];
    if (matchingPreset) {
      const presetBtn = document.querySelector(`.preset-pill[data-preset="${matchingPreset}"]`);
      if (presetBtn) {
        document.querySelectorAll('.preset-pill').forEach(b => b.classList.remove('active'));
        presetBtn.classList.add('active');
        studioState.preset = matchingPreset;
      }
    }
  }

  updateStudioInputLabelsForPreset(studioState.preset);
  generateFanpageCaption();
  renderContentCanvas();
}

function selectTone(btn) {
  document.querySelectorAll('.tone-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  studioState.tone = btn.getAttribute('data-tone');
  generateFanpageCaption();
}

function generateFanpageCaption() {
  const shoeInfo = document.getElementById('studio-shoe-info').value.trim() || 'đôi giày yêu thích';
  const custName = document.getElementById('studio-customer-name').value.trim();
  const servicesText = document.getElementById('studio-services-text').value.trim() || 'Vệ sinh & Chăm sóc cao cấp';
  const priceText = document.getElementById('studio-price-text').value.trim() || 'Giá cực ưu đãi';
  const notesText = document.getElementById('studio-notes-text').value.trim();
  
  const info = getStoreInfo();
  const storeName = info.name || 'SPA GIÀY';
  const hotline = info.hotline || '0906 22 7512';
  const address = info.address || 'Hà Nội';

  let caption = '';
  const preset = studioState.preset || 'before_after';
  const tone = studioState.tone || 'friendly';

  // Generate captions according to Preset & Tone
  if (preset === 'before_after') {
    if (tone === 'friendly') {
      caption += `🌟 LỘT XÁC DIỆU KỲ CHO ĐÔI ${shoeInfo.toUpperCase()}! 👟✨\n\n`;
      caption += `Cùng ngắm nhìn sự thay đổi bất ngờ của em giày ${shoeInfo} sau khi được đội ngũ ${storeName} "phù phép" nhé mọi người ơi!\n\n`;
      caption += `✨ Dịch vụ thực hiện: ${servicesText}\n`;
      if (notesText) caption += `🔍 Tình trạng & Phục hồi: ${notesText}\n`;
      caption += `💸 Chi phí trọn gói: ${priceText}\n\n`;
      caption += `Giày đi lâu bẩn ố hay sờn cũ cứ yên tâm gửi gắm cho ${storeName}, trả lại vẻ đẹp như vừa đập hộp! 💙\n\n`;
    } else if (tone === 'professional') {
      caption += `📋 BÁO CÁO KẾT QUẢ QUY TRÌNH CHĂM SÓC & PHỤC HỒI: ${shoeInfo.toUpperCase()}\n\n`;
      caption += `${storeName} xin gửi tới quý khách hàng hình ảnh kết quả trước và sau khi hoàn thiện dịch vụ Spa cho siêu phẩm ${shoeInfo}.\n\n`;
      caption += `📌 Hạng mục xử lý kỹ thuật:\n- Dịch vụ: ${servicesText}\n`;
      if (notesText) caption += `- Kết quả đạt được: ${notesText}\n`;
      caption += `- Chi phí niêm yết: ${priceText}\n\n`;
      caption += `Cam kết sử dụng dung dịch dung môi chuyên dụng an toàn tuyệt đối cho chất liệu da & vải.\n\n`;
    } else if (tone === 'viral') {
      caption += `😱 KHÔNG THỂ TIN NỔI! ĐÔI ${shoeInfo.toUpperCase()} TƯỞNG BỎ ĐỊ CŨNG HỒI SINH RỰC RỠ! 🔥\n\n`;
      caption += `Nhiều bạn cứ nghĩ giày ố bẩn nặng là xong phim rồi, nhưng qua tay các thuật sĩ tại ${storeName} thì lại biến hóa hoàn hảo 10/10! 😎\n\n`;
      caption += `💥 Phép thuật biến hóa: ${servicesText}\n`;
      if (notesText) caption += `✨ Điểm ăn tiền: ${notesText}\n`;
      caption += `🏷️ Giá hời ngỡ ngàng: Chỉ ${priceText}\n\n`;
      caption += `Tag ngay người bạn có đôi giày bẩn vào đây để đi Spa gấp nhé! 👇\n\n`;
    } else { // luxury
      caption += `✨ VẺ ĐẸP NGUYÊN BẢN TRỜ LẠI VỚI ${shoeInfo.toUpperCase()} ✨\n\n`;
      caption += `Mỗi đôi giày hiệu không chỉ là phụ kiện, mà là tuyên ngôn phong cách. Tại ${storeName}, chúng tôi nâng niu từng đường kim mũi chỉ và bề mặt da cao cấp.\n\n`;
      caption += `💎 Dịch vụ nghệ nhân: ${servicesText}\n`;
      if (notesText) caption += `💎 Điểm nhấn phục hồi: ${notesText}\n`;
      caption += `💎 Giá trị đầu tư: ${priceText}\n\n`;
      caption += `Trải nghiệm dịch vụ chăm sóc giày đẳng cấp ngay hôm nay.\n\n`;
    }
  } else if (preset === 'tips' || preset === 'price_service') {
    const tipTitle = document.getElementById('studio-shoe-info').value.trim() || 'CÁCH TẨY VẾT Ố VÀNG ĐẾ GIÀY SNEAKER TRẮNG';
    const tipPrep = document.getElementById('studio-customer-name').value.trim() || 'Bàn chải mềm, Chanh tươi & Kem đánh răng';
    const tipStep1 = document.getElementById('studio-services-text').value.trim() || 'Thoa nhẹ hỗn hợp chanh & kem đánh răng lên vết ố vàng';
    const tipStep2 = document.getElementById('studio-price-text').value.trim() || 'Dùng bàn chải chà nhẹ nhàng theo chiều kim đồng hồ 3-5 phút';
    const tipNote = document.getElementById('studio-notes-text').value.trim() || 'Tránh phơi trực tiếp dưới ánh nắng mặt trời gắt';

    caption += `💡 MẸO VẶT BẢO QUẢN GIÀY: ${tipTitle.toUpperCase()} 👟✨\n\n`;
    caption += `Đôi giày yêu thích bị bẩn hoặc ố vàng khiến bạn kém tự tin? Đừng lo, ${storeName} chia sẻ ngay mẹo xử lý cực dễ chỉ với nguyên liệu có sẵn tại nhà!\n\n`;
    caption += `🧪 CHUẨN BỊ NGUYÊN LIỆU:\n- ${tipPrep}\n\n`;
    caption += `📋 CÁC BƯỚC THỰC HIỆN:\n`;
    caption += `1️⃣ Bước 1: ${tipStep1}\n`;
    caption += `2️⃣ Bước 2: ${tipStep2}\n\n`;
    if (tipNote) caption += `⚠️ LƯU Ý QUAN TRỌNG:\n- ${tipNote}\n\n`;
    caption += `💙 Nếu bạn bận rộn hoặc gặp vết bẩn cứng đầu khó xử lý, hãy mang ngay tới ${storeName} để được chăm sóc chuẩn Spa chuyên nghiệp nhé!\n\n`;
  } else if (preset === 'feedback') {
    caption += `💬 FEEDBACK SIÊU CÓ TÂM TỪ KHÁCH HÀNG THÂN YÊU! ⭐⭐⭐⭐⭐\n\n`;
    if (custName) caption += `Cảm ơn ${custName} đã gửi trọn niềm tin cho ${storeName} với đôi ${shoeInfo} nha! 🥰\n\n`;
    else caption += `Cảm ơn quý khách hàng đã gửi trọn niềm tin cho ${storeName} với đôi ${shoeInfo} nha! 🥰\n\n`;
    caption += `"Giày gửi Spa về sạch như mới, mùi thơm dịu nhẹ rất thích luôn ạ!"\n\n`;
    caption += `🛠️ Dịch vụ đã trải nghiệm: ${servicesText} (${priceText})\n`;
    if (notesText) caption += `✨ Ghi nhận: ${notesText}\n\n`;
    caption += `Sự hài lòng của khách hàng chính là động lực lớn nhất của đội ngũ ${storeName} mỗi ngày! ❤️\n\n`;
  } else if (preset === 'promotion') {
    const promoTitle = document.getElementById('studio-shoe-info').value.trim() || 'CHƯƠNG TRÌNH KHUYẾN MẠI ĐẶC BIỆT';
    const promoTime = document.getElementById('studio-customer-name').value.trim() || 'Áp dụng số lượng có hạn';
    const promoServices = document.getElementById('studio-services-text').value.trim() || 'Áp dụng cho tất cả dịch vụ Spa & Giặt giày';
    const promoPrice = document.getElementById('studio-price-text').value.trim() || 'Giảm 20% | Chỉ từ 50.000đ';
    const promoTagline = document.getElementById('studio-notes-text').value.trim() || 'Giày sạch kính kong đón hè cực chất';

    caption += `🔥 ${promoTitle.toUpperCase()} 🔥\n\n`;
    caption += `📢 ${promoTagline.toUpperCase()}!\n\n`;
    caption += `Cơ hội F5 lại toàn bộ tủ giày yêu thích của bạn cùng ${storeName} với chương trình siêu ưu đãi:\n\n`;
    caption += `🎁 NỘI DUNG ƯU ĐÃI: ${promoServices}\n`;
    caption += `💥 GIÁ ƯU ĐÃI: ${promoPrice}\n`;
    caption += `⏰ THỜI GIAN ÁP DỤNG: ${promoTime}\n\n`;
    caption += `👉 Nhanh tay Inbox Fanpage hoặc liên hệ Hotline để đăng ký giữ suất ưu đãi ngay hôm nay nhé!\n\n`;
  } else if (preset === 'simple_framed') {
    caption += `✨ ${shoeInfo.toUpperCase()} - SPA & CHĂM SÓC GIÀY TẠI ${storeName.toUpperCase()} ✨\n\n`;
    caption += `Gửi tới quý khách hàng hình ảnh thực tế từ workshop của ${storeName}.\n\n`;
    if (servicesText) caption += `📌 Dịch vụ thực hiện: ${servicesText}\n`;
    if (priceText) caption += `💸 Chi phí trọn gói: ${priceText}\n`;
    if (notesText) caption += `🔍 Ghi chú tình trạng: ${notesText}\n\n`;
    caption += `Ghé ngay ${storeName} để đôi giày yêu thích của bạn được chăm sóc chuẩn Spa tốt nhất nhé! 💙\n\n`;
  } else { // story
    caption += `🛠️ HÀNH TRÌNH PHỤC HỒI ĐÔI ${shoeInfo.toUpperCase()} TỈ MỈ TẠI WORKSHOP 🎨\n\n`;
    caption += `Khi tiếp nhận đôi ${shoeInfo}, chúng tôi hiểu rằng đây là món đồ gắn liền với nhiều kỷ niệm của chủ nhân.\n\n`;
    caption += `Trải qua 5 bước chăm sóc chuyên sâu:\n`;
    caption += `1️⃣ Phân tích chất liệu da/vải & làm sạch bề mặt thô\n`;
    caption += `2️⃣ Giặt hấp thủ công bằng dung dịch hữu cơ sinh học\n`;
    caption += `3️⃣ Xử lý chuyên sâu: ${servicesText}\n`;
    if (notesText) caption += `4️⃣ Kỹ thuật phục hồi: ${notesText}\n`;
    caption += `5️⃣ Phủ nano bảo vệ bề mặt & diệt khuẩn khử mùi UV\n\n`;
    caption += `💰 Chi phí hoàn thiện: ${priceText}\n\n`;
  }

  // Footer Contacts & Hashtags
  caption += `------------------------------------\n`;
  caption += `☎️ Hotline/Zalo tư vấn & đặt lịch: ${hotline}\n`;
  caption += `📍 Địa chỉ Cửa hàng: ${address}\n`;
  caption += `🌐 Tra cứu đơn hàng trực tuyến dễ dàng!\n\n`;
  const cleanStoreHashtag = storeName.replace(/[^a-zA-Z0-9àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/gi, '');
  const cleanShoeHashtag = shoeInfo.replace(/[^a-zA-Z0-9àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/gi, '');
  caption += `#${cleanStoreHashtag} #SpaGiay #Vesinhgiay #RepaintGiay #TayOGiay #${cleanShoeHashtag}`;

  const captionArea = document.getElementById('studio-caption-output');
  if (captionArea) captionArea.value = caption;
}

function copyStudioCaption() {
  const textarea = document.getElementById('studio-caption-output');
  if (!textarea || !textarea.value) return;

  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(textarea.value)
      .then(() => showToast('Đã sao chép bài viết Fanpage thành công!'))
      .catch(err => {
        textarea.select();
        document.execCommand('copy');
        showToast('Đã sao chép bài viết Fanpage!');
      });
  } else {
    textarea.select();
    document.execCommand('copy');
    showToast('Đã sao chép bài viết Fanpage!');
  }
}

// Draw Canvas Engine
function renderContentCanvas() {
  const canvas = document.getElementById('content-studio-canvas');
  if (!canvas) return;

  const ctx = canvas.getContext('2d');
  const width = canvas.width;   // 1080
  const height = canvas.height; // 1080

  const themeSelect = document.getElementById('canvas-theme-select');
  const theme = themeSelect ? themeSelect.value : 'brand_dark';
  const badgeInput = document.getElementById('canvas-badge-input');
  const badgeText = badgeInput ? badgeInput.value.trim() : 'SPA GIÀY CAO CẤP';
  
  const logoCb = document.getElementById('canvas-show-logo');
  const showLogo = logoCb ? logoCb.checked : true;
  const hotlineCb = document.getElementById('canvas-show-hotline');
  const showHotline = hotlineCb ? hotlineCb.checked : true;
  const priceCb = document.getElementById('canvas-show-price');
  const showPrice = priceCb ? priceCb.checked : true;

  const shoeInput = document.getElementById('studio-shoe-info');
  const shoeInfo = shoeInput ? (shoeInput.value.trim() || 'SHOE SPA REPAIR') : 'SHOE SPA REPAIR';
  const priceInput = document.getElementById('studio-price-text');
  const priceText = priceInput ? priceInput.value.trim() : '';
  const servInput = document.getElementById('studio-services-text');
  const servicesText = servInput ? servInput.value.trim() : '';
  const custInput = document.getElementById('studio-customer-name');
  const custName = custInput ? (custInput.value.trim() || 'Khách Hàng Thân Thiết') : 'Khách Hàng Thân Thiết';
  const notesInput = document.getElementById('studio-notes-text');
  const notesText = notesInput ? notesInput.value.trim() : '';
  const preset = studioState.preset || 'before_after';

  const info = getStoreInfo();
  const storeName = info.name || 'SPA GIÀY';
  const hotline = info.hotline || '0906 22 7512';
  const address = info.address || 'HÀ NỘI';
  const logoUrl = info.logoUrl || '';

  // Theme Colors
  let bgGrad1 = '#1F1610', bgGrad2 = '#3C2A1E', accentGold = '#E89C19', textColor = '#FFFFFF', subTextColor = '#EADFD5';
  if (theme === 'brand_cream') {
    bgGrad1 = '#FAF6F0'; bgGrad2 = '#EADFD5'; accentGold = '#C87D0E'; textColor = '#2A1E17'; subTextColor = '#5C4436';
  } else if (theme === 'midnight') {
    bgGrad1 = '#0F172A'; bgGrad2 = '#1E293B'; accentGold = '#38BDF8'; textColor = '#FFFFFF'; subTextColor = '#94A3B8';
  } else if (theme === 'emerald') {
    bgGrad1 = '#064E3B'; bgGrad2 = '#022C22'; accentGold = '#F59E0B'; textColor = '#FFFFFF'; subTextColor = '#A7F3D0';
  } else if (theme === 'sunset') {
    bgGrad1 = '#881337'; bgGrad2 = '#4C0519'; accentGold = '#F97316'; textColor = '#FFFFFF'; subTextColor = '#FECDD3';
  }

  // Clear & Draw Background Gradient
  const grad = ctx.createLinearGradient(0, 0, width, height);
  grad.addColorStop(0, bgGrad1);
  grad.addColorStop(1, bgGrad2);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, width, height);

  // Background Subtle Decorative Circles
  ctx.fillStyle = 'rgba(255, 255, 255, 0.03)';
  ctx.beginPath();
  ctx.arc(width * 0.9, height * 0.1, 300, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(width * 0.1, height * 0.9, 400, 0, Math.PI * 2);
  ctx.fill();

  // Load images & draw template layout
  const imgUrls = studioState.images || [];

  function drawRoundedRect(x, y, w, h, radius, fillStyle, strokeStyle, lineWidth) {
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + w - radius, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
    ctx.lineTo(x + w, y + h - radius);
    ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
    ctx.lineTo(x + radius, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();
    if (fillStyle) {
      ctx.fillStyle = fillStyle;
      ctx.fill();
    }
    if (strokeStyle) {
      ctx.strokeStyle = strokeStyle;
      ctx.lineWidth = lineWidth || 1;
      ctx.stroke();
    }
  }

  const loadImg = (url) => new Promise(resolve => {
    if (!url) resolve(null);
    const img = new Image();
    img.crossOrigin = 'Anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = url;
  });

  Promise.all([
    loadImg(imgUrls[0]),
    loadImg(imgUrls[1]),
    loadImg(logoUrl)
  ]).then(([img1, img2, logoImg]) => {

    const tpl = studioState.graphicTemplate || 'before_after_split';

    // 1. TOP HEADER (Store Name & Logo)
    if (showLogo && logoImg) {
      const logoSize = 70;
      ctx.drawImage(logoImg, 60, 45, logoSize, logoSize);
      
      ctx.font = 'bold 36px "Segoe UI", sans-serif';
      ctx.fillStyle = textColor;
      ctx.textAlign = 'left';
      ctx.fillText(storeName.toUpperCase(), 150, 75);

      ctx.font = '600 20px "Segoe UI", sans-serif';
      ctx.fillStyle = accentGold;
      ctx.fillText(badgeText.toUpperCase(), 150, 105);
    } else {
      ctx.font = 'bold 42px "Segoe UI", sans-serif';
      ctx.fillStyle = textColor;
      ctx.textAlign = 'left';
      ctx.fillText(storeName.toUpperCase(), 60, 80);

      ctx.font = '600 22px "Segoe UI", sans-serif';
      ctx.fillStyle = accentGold;
      ctx.fillText(badgeText.toUpperCase(), 60, 115);
    }

    // Top Right Badge Pill
    if (badgeText) {
      drawRoundedRect(width - 330, 55, 270, 48, 24, accentGold);
      ctx.font = 'bold 20px "Segoe UI", sans-serif';
      ctx.fillStyle = '#FFFFFF';
      ctx.textAlign = 'center';
      ctx.fillText(badgeText, width - 195, 86);
    }

    // 2. MAIN TEMPLATE CONTENT AREA
    if (tpl === 'before_after_split') {
      // Layout 1: Split Left (Before) & Right (After)
      const boxY = 160;
      const boxH = 720;
      const boxW = 465;

      // Left Box (Before)
      drawRoundedRect(60, boxY, boxW, boxH, 20, 'rgba(0,0,0,0.3)', 'rgba(255,255,255,0.1)', 2);
      if (img1) {
        ctx.save();
        drawRoundedRect(60, boxY, boxW, boxH, 20);
        ctx.clip();
        drawCoverImage(ctx, img1, 60, boxY, boxW, boxH);
        ctx.restore();
      } else {
        ctx.font = 'bold 24px "Segoe UI", sans-serif';
        ctx.fillStyle = 'rgba(255,255,255,0.3)';
        ctx.textAlign = 'center';
        ctx.fillText('ẢNH TRƯỚC (BEFORE)', 60 + boxW/2, boxY + boxH/2);
      }
      // Label BEFORE
      drawRoundedRect(80, boxY + 20, 140, 40, 8, '#DC2626');
      ctx.font = 'bold 18px "Segoe UI", sans-serif';
      ctx.fillStyle = '#FFFFFF';
      ctx.textAlign = 'center';
      ctx.fillText('BEFORE', 150, boxY + 46);

      // Right Box (After)
      const rightX = 555;
      drawRoundedRect(rightX, boxY, boxW, boxH, 20, 'rgba(0,0,0,0.3)', 'rgba(255,255,255,0.1)', 2);
      const afterImg = img2 || img1;
      if (afterImg) {
        ctx.save();
        drawRoundedRect(rightX, boxY, boxW, boxH, 20);
        ctx.clip();
        drawCoverImage(ctx, afterImg, rightX, boxY, boxW, boxH);
        ctx.restore();
      } else {
        ctx.font = 'bold 24px "Segoe UI", sans-serif';
        ctx.fillStyle = 'rgba(255,255,255,0.3)';
        ctx.textAlign = 'center';
        ctx.fillText('ẢNH SAU (AFTER)', rightX + boxW/2, boxY + boxH/2);
      }
      // Label AFTER
      drawRoundedRect(rightX + 20, boxY + 20, 140, 40, 8, '#16A34A');
      ctx.font = 'bold 18px "Segoe UI", sans-serif';
      ctx.fillStyle = '#FFFFFF';
      ctx.textAlign = 'center';
      ctx.fillText('AFTER', rightX + 90, boxY + 46);

      // Bottom Shoe Title Banner Card
      drawRoundedRect(60, boxY + boxH - 110, 960, 90, 16, 'rgba(15, 23, 42, 0.88)', accentGold, 2);
      ctx.font = 'bold 28px "Segoe UI", sans-serif';
      ctx.fillStyle = '#FFFFFF';
      ctx.textAlign = 'left';
      ctx.fillText(shoeInfo.toUpperCase(), 90, boxY + boxH - 65);

      ctx.font = '600 20px "Segoe UI", sans-serif';
      ctx.fillStyle = '#E2E8F0';
      ctx.fillText(`Dịch vụ: ${servicesText || 'Spa & Phục hồi chuyên sâu'}`, 90, boxY + boxH - 32);

      if (showPrice && priceText) {
        ctx.font = 'bold 28px "Segoe UI", sans-serif';
        ctx.fillStyle = accentGold;
        ctx.textAlign = 'right';
        ctx.fillText(priceText, 990, boxY + boxH - 48);
      }

    } else if (tpl === 'showcase_badge') {
      // Layout 2: Split 2-Column Infographic Mẹo Vặt Vệ Sinh Giày Layout
      const isTipsPreset = (preset === 'tips' || preset === 'price_service');
      const tipTitle = isTipsPreset ? (document.getElementById('studio-shoe-info').value.trim() || 'CÁCH TẨY Ố VÀNG ĐẾ GIÀY SNEAKER TRẮNG') : shoeInfo;
      const tipPrep = isTipsPreset ? (document.getElementById('studio-customer-name').value.trim() || 'Bàn chải mềm, Chanh tươi & Kem đánh răng') : custName;
      const tipStep1 = servicesText || 'Thoa nhẹ hỗn hợp chanh & kem đánh răng lên vết ố vàng';
      const tipStep2 = priceText || 'Dùng bàn chải chà nhẹ nhàng theo chiều kim đồng hồ 3-5 phút';
      const tipNote = notesText || 'Tránh phơi trực tiếp dưới ánh nắng gắt';

      // Header Badge: 💡 MẸO VẶT BẢO QUẢN GIÀY
      drawRoundedRect(width / 2 - 240, 140, 480, 52, 26, '#F59E0B', '#FBBF24', 2);
      ctx.font = 'bold 22px "Segoe UI", sans-serif';
      ctx.fillStyle = '#FFFFFF';
      ctx.textAlign = 'center';
      ctx.fillText('💡 MẸO VẶT BẢO QUẢN GIÀY 💡', width / 2, 174);

      // Main Tip Title Header
      ctx.font = 'bold 36px "Segoe UI", sans-serif';
      ctx.fillStyle = accentGold;
      ctx.textAlign = 'center';
      wrapText(ctx, tipTitle.toUpperCase(), width / 2, 235, 960, 44);

      // 2-Column Layout (Left: Shoe Photo Frame, Right: Infographic Tips Cards)
      const contentY = 300;
      const contentH = 430;

      // Left Column: Photo Frame (Width 430)
      const photoX = 60;
      const photoW = 430;
      drawRoundedRect(photoX, contentY, photoW, contentH, 20, 'rgba(30, 41, 59, 0.85)', accentGold, 2);

      if (img1) {
        ctx.save();
        drawRoundedRect(photoX, contentY, photoW, contentH, 20);
        ctx.clip();
        drawCoverImage(ctx, img1, photoX, contentY, photoW, contentH);
        
        // Gradient overlay on photo bottom
        const pGrad = ctx.createLinearGradient(photoX, contentY + contentH - 80, photoX, contentY + contentH);
        pGrad.addColorStop(0, 'rgba(0,0,0,0)');
        pGrad.addColorStop(1, 'rgba(15, 23, 42, 0.85)');
        ctx.fillStyle = pGrad;
        ctx.fillRect(photoX, contentY + contentH - 80, photoW, 80);
        ctx.restore();

        ctx.font = '600 18px "Segoe UI", sans-serif';
        ctx.fillStyle = '#FFFFFF';
        ctx.textAlign = 'center';
        ctx.fillText('👟 HÌNH ẢNH MINH HỌA', photoX + photoW / 2, contentY + contentH - 25);
      } else {
        // Placeholder Graphic when no photo is uploaded
        ctx.font = '54px "Segoe UI", sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('👟', photoX + photoW / 2, contentY + 180);

        ctx.font = 'bold 22px "Segoe UI", sans-serif';
        ctx.fillStyle = '#E2E8F0';
        ctx.fillText('ẢNH MINH HỌA GIÀY', photoX + photoW / 2, contentY + 250);

        ctx.font = '16px "Segoe UI", sans-serif';
        ctx.fillStyle = '#94A3B8';
        ctx.fillText('Tải 1 ảnh giày lên để hiển thị ở đây', photoX + photoW / 2, contentY + 290);
      }

      // Right Column: Infographic Cards (Width 500)
      const cardX = 520;
      const cardW = 500;

      // 1. Preparation Card
      drawRoundedRect(cardX, contentY, cardW, 85, 14, 'rgba(245, 158, 11, 0.15)', '#F59E0B', 1);
      ctx.font = 'bold 19px "Segoe UI", sans-serif';
      ctx.fillStyle = '#F59E0B';
      ctx.textAlign = 'left';
      ctx.fillText('🧪 CHUẨN BỊ NGUYÊN LIỆU:', cardX + 20, contentY + 32);
      ctx.font = '600 17px "Segoe UI", sans-serif';
      ctx.fillStyle = '#E2E8F0';
      wrapText(ctx, tipPrep, cardX + 20, contentY + 60, cardW - 40, 22);

      // 2. Step 1 Card
      drawRoundedRect(cardX, contentY + 105, cardW, 95, 14, 'rgba(255, 255, 255, 0.07)', 'rgba(255,255,255,0.15)', 1);
      ctx.font = 'bold 19px "Segoe UI", sans-serif';
      ctx.fillStyle = accentGold;
      ctx.fillText('1️⃣ BƯỚC 1:', cardX + 20, contentY + 135);
      ctx.font = '600 17px "Segoe UI", sans-serif';
      ctx.fillStyle = '#FFFFFF';
      wrapText(ctx, tipStep1, cardX + 20, contentY + 163, cardW - 40, 22);

      // 3. Step 2 Card
      drawRoundedRect(cardX, contentY + 218, cardW, 95, 14, 'rgba(255, 255, 255, 0.07)', 'rgba(255,255,255,0.15)', 1);
      ctx.font = 'bold 19px "Segoe UI", sans-serif';
      ctx.fillStyle = accentGold;
      ctx.fillText('2️⃣ BƯỚC 2:', cardX + 20, contentY + 248);
      ctx.font = '600 17px "Segoe UI", sans-serif';
      ctx.fillStyle = '#FFFFFF';
      wrapText(ctx, tipStep2, cardX + 20, contentY + 276, cardW - 40, 22);

      // 4. Warning / Note Card
      drawRoundedRect(cardX, contentY + 330, cardW, 95, 14, 'rgba(220, 38, 38, 0.18)', '#EF4444', 1);
      ctx.font = 'bold 19px "Segoe UI", sans-serif';
      ctx.fillStyle = '#EF4444';
      ctx.fillText('⚠️ LƯU Ý QUAN TRỌNG:', cardX + 20, contentY + 360);
      ctx.font = '600 17px "Segoe UI", sans-serif';
      ctx.fillStyle = '#FECDD3';
      wrapText(ctx, tipNote, cardX + 20, contentY + 388, cardW - 40, 22);
    } else if (tpl === 'customer_feedback') {
      // Layout 3: Customer Feedback Card Style
      const photoW = 440, photoH = 660;
      drawRoundedRect(60, 160, photoW, photoH, 20, 'rgba(0,0,0,0.3)', 'rgba(255,255,255,0.1)', 2);
      if (img1) {
        ctx.save();
        drawRoundedRect(60, 160, photoW, photoH, 20);
        ctx.clip();
        drawCoverImage(ctx, img1, 60, 160, photoW, photoH);
        ctx.restore();
      }

      // Right Feedback Text Box
      const fbX = 530, fbY = 160, fbW = 490, fbH = 660;
      drawRoundedRect(fbX, fbY, fbW, fbH, 20, 'rgba(255,255,255,0.08)', 'rgba(255,255,255,0.15)', 2);

      // 5 Gold Stars
      ctx.font = '36px "Segoe UI", sans-serif';
      ctx.fillStyle = '#F59E0B';
      ctx.textAlign = 'left';
      ctx.fillText('★★★★★', fbX + 40, fbY + 70);

      ctx.font = 'bold 30px "Segoe UI", sans-serif';
      ctx.fillStyle = textColor;
      ctx.fillText('FEEDBACK KHÁCH HÀNG', fbX + 40, fbY + 125);

      ctx.font = 'italic 24px "Segoe UI", sans-serif';
      ctx.fillStyle = subTextColor;
      const quoteText = `"Giày gửi Spa về sạch bong như mới đập hộp, thơm phức luôn ạ! Cảm ơn ${storeName} nhiều nhé!"`;
      wrapText(ctx, quoteText, fbX + 40, fbY + 180, fbW - 80, 36);

      // Customer Info Tag
      ctx.font = 'bold 24px "Segoe UI", sans-serif';
      ctx.fillStyle = accentGold;
      ctx.fillText(`— Khách hàng: ${custName}`, fbX + 40, fbY + 450);

      ctx.font = '600 20px "Segoe UI", sans-serif';
      ctx.fillStyle = textColor;
      ctx.fillText(`👟 Hiệu giày: ${shoeInfo}`, fbX + 40, fbY + 500);
      ctx.fillText(`🛠️ Dịch vụ: ${servicesText}`, fbX + 40, fbY + 540);

    } else if (tpl === 'simple_framed') {
      // Layout 5: Single Image Frame with Store Logo, Store Name, Hotline & Address
      const heroX = 50;
      const heroY = 150;
      const heroW = width - (heroX * 2);
      const heroH = 750;
      const borderRadius = 20;

      // Outer frame outline with accent color
      drawRoundedRect(heroX, heroY, heroW, heroH, borderRadius, 'rgba(15, 23, 42, 0.6)', accentGold, 3);

      if (img1) {
        ctx.save();
        drawRoundedRect(heroX, heroY, heroW, heroH, borderRadius);
        ctx.clip();
        drawCoverImage(ctx, img1, heroX, heroY, heroW, heroH);

        // Bottom subtle gradient overlay inside image
        const pGrad = ctx.createLinearGradient(heroX, heroY + heroH - 120, heroX, heroY + heroH);
        pGrad.addColorStop(0, 'rgba(0,0,0,0)');
        pGrad.addColorStop(1, 'rgba(15, 23, 42, 0.85)');
        ctx.fillStyle = pGrad;
        ctx.fillRect(heroX, heroY + heroH - 120, heroW, 120);
        ctx.restore();

        // Overlay Label on Photo if shoeInfo or service text exists
        if (shoeInfo && shoeInfo !== 'SHOE SPA REPAIR') {
          ctx.font = 'bold 26px "Segoe UI", sans-serif';
          ctx.fillStyle = '#FFFFFF';
          ctx.textAlign = 'left';
          ctx.fillText(shoeInfo.toUpperCase(), heroX + 30, heroY + heroH - 45);

          if (servicesText) {
            ctx.font = '600 20px "Segoe UI", sans-serif';
            ctx.fillStyle = accentGold;
            ctx.fillText(`• Dịch vụ: ${servicesText}`, heroX + 30, heroY + heroH - 16);
          }
        }
      } else {
        // Placeholder graphic if no photo selected yet
        ctx.font = '64px "Segoe UI", sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('🖼️', width / 2, heroY + 300);

        ctx.font = 'bold 30px "Segoe UI", sans-serif';
        ctx.fillStyle = '#E2E8F0';
        ctx.fillText('KHUNG ÁNH THƯƠNG HIỆU', width / 2, heroY + 390);

        ctx.font = '18px "Segoe UI", sans-serif';
        ctx.fillStyle = '#94A3B8';
        ctx.fillText('Chọn hoặc tải 1 ảnh sản phẩm / dịch vụ để hiển thị vào khung', width / 2, heroY + 430);
      }

    } else {
      // Layout 4: High-Impact Professional Marketing Promo Banner Style
      const isPromoPreset = (preset === 'promotion');
      const promoTitle = isPromoPreset ? (document.getElementById('studio-shoe-info').value.trim() || 'CHƯƠNG TRÌNH KHUYẾN MẠI') : shoeInfo;
      const promoTime = isPromoPreset ? (document.getElementById('studio-customer-name').value.trim() || 'Áp dụng số lượng có hạn') : custName;
      const promoServices = servicesText || 'Vệ sinh & Phục hồi giày chuyên sâu';
      const promoDiscount = priceText || 'GIẢM 20% | CHỈ TỪ 50K';
      const promoTagline = notesText || 'Giày sạch kính kong đón hè cực chất cùng Phủi Bụi';

      // Top Floating Badge: "🔥 CHƯƠNG TRÌNH KHUYẾN MẠI 🔥"
      drawRoundedRect(width / 2 - 240, 140, 480, 48, 24, '#DC2626', '#EF4444', 2);
      ctx.font = 'bold 22px "Segoe UI", sans-serif';
      ctx.fillStyle = '#FFFFFF';
      ctx.textAlign = 'center';
      ctx.fillText('🔥 CHƯƠNG TRÌNH KHUYẾN MẠI 🔥', width / 2, 172);

      // Main Campaign Title (Shifted down to Y = 255 to create comfortable spacing)
      ctx.font = 'bold 42px "Segoe UI", sans-serif';
      ctx.fillStyle = accentGold;
      ctx.textAlign = 'center';
      wrapText(ctx, promoTitle.toUpperCase(), width / 2, 255, 940, 48);

      // Tagline / Subheadline
      if (promoTagline) {
        ctx.font = 'italic 600 24px "Segoe UI", sans-serif';
        ctx.fillStyle = '#E2E8F0';
        ctx.fillText(`" ${promoTagline} "`, width / 2, 318);
      }

      // Middle Hero Area (Photo OR Promo Graphics Card)
      const heroY = promoTagline ? 342 : 320;
      const heroH = 440;
      const heroW = 940;
      const heroX = (width - heroW) / 2;

      if (img1) {
        // Photo with glowing golden border
        drawRoundedRect(heroX, heroY, heroW, heroH, 20, 'rgba(0,0,0,0.4)', accentGold, 3);
        ctx.save();
        drawRoundedRect(heroX, heroY, heroW, heroH, 20);
        ctx.clip();
        drawCoverImage(ctx, img1, heroX, heroY, heroW, heroH);
        
        // Linear gradient overlay on bottom of photo
        const pGrad = ctx.createLinearGradient(heroX, heroY + heroH - 120, heroX, heroY + heroH);
        pGrad.addColorStop(0, 'rgba(0,0,0,0)');
        pGrad.addColorStop(1, 'rgba(15, 23, 42, 0.92)');
        ctx.fillStyle = pGrad;
        ctx.fillRect(heroX, heroY + heroH - 120, heroW, 120);
        ctx.restore();

        // Overlay Service Badge on photo
        ctx.font = '600 22px "Segoe UI", sans-serif';
        ctx.fillStyle = '#FFFFFF';
        ctx.textAlign = 'left';
        ctx.fillText(`👉 ${promoServices}`, heroX + 30, heroY + heroH - 35);
      } else {
        // Graphic Card Frame (when no photo is uploaded)
        drawRoundedRect(heroX, heroY, heroW, heroH, 20, 'rgba(30, 41, 59, 0.85)', 'rgba(234, 179, 8, 0.4)', 2);
        
        ctx.font = 'bold 36px "Segoe UI", sans-serif';
        ctx.fillStyle = '#FFFFFF';
        ctx.textAlign = 'center';
        ctx.fillText('⚡ ƯU ĐÃI ĐẶC BIỆT DÀNH CHO BẠN ⚡', width / 2, heroY + 140);

        ctx.font = '600 28px "Segoe UI", sans-serif';
        ctx.fillStyle = accentGold;
        ctx.fillText(`✨ ${promoServices}`, width / 2, heroY + 230);

        if (promoTime) {
          ctx.font = '24px "Segoe UI", sans-serif';
          ctx.fillStyle = '#94A3B8';
          ctx.fillText(`⏰ ${promoTime}`, width / 2, heroY + 310);
        }
      }

      // Bottom Highlight Callout Pill: "GIẢM 20% - CHỈ TỪ 50.000đ"
      const pillY = heroY + heroH + 25;
      const pillW = 760;
      const pillX = (width - pillW) / 2;
      drawRoundedRect(pillX, pillY, pillW, 85, 42, '#EAB308', '#FACC15', 2);

      ctx.font = 'bold 36px "Segoe UI", sans-serif';
      ctx.fillStyle = '#0F172A';
      ctx.textAlign = 'center';
      ctx.fillText(promoDiscount.toUpperCase(), width / 2, pillY + 54);
    }

    // 3. FOOTER (Hotline & Address - Professional Monochromatic Vector Styling)
    if (showHotline) {
      const footerH = 95;
      const footerY = height - footerH;

      // Dark luxury container bar matching theme background tone
      ctx.fillStyle = 'rgba(10, 15, 26, 0.92)';
      ctx.fillRect(0, footerY, width, footerH);

      // Top subtle border line
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, footerY);
      ctx.lineTo(width, footerY);
      ctx.stroke();

      const centerY = footerY + footerH / 2;

      // Left: Vector Phone Icon + Hotline/Zalo Text
      const phoneIconX = 65;
      drawVectorIconPhone(ctx, phoneIconX, centerY, 34, accentGold);

      ctx.font = 'bold 22px "Segoe UI", sans-serif';
      ctx.fillStyle = accentGold;
      ctx.textAlign = 'left';
      ctx.fillText(`HOTLINE / ZALO: ${hotline}`, phoneIconX + 26, centerY + 7);

      // Right: Vector Pin Icon + Address Text
      const pinIconX = width - 440;
      drawVectorIconPin(ctx, pinIconX, centerY, 34, '#E2E8F0');

      ctx.font = '600 18px "Segoe UI", sans-serif';
      ctx.fillStyle = '#E2E8F0';
      ctx.textAlign = 'left';
      
      let displayAddress = address;
      if (displayAddress.length > 38) {
        displayAddress = displayAddress.substring(0, 36) + '...';
      }
      ctx.fillText(displayAddress, pinIconX + 26, centerY + 6);
    }

  });
}

function drawVectorIconPhone(ctx, x, y, size, color) {
  ctx.save();
  ctx.translate(x, y);
  
  // Solid Circle Badge Background
  ctx.beginPath();
  ctx.arc(0, 0, size / 2, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();

  // Contrast Inner Color (Dark Theme background)
  const innerColor = 'rgba(15, 23, 42, 0.95)';
  ctx.fillStyle = innerColor;
  ctx.strokeStyle = innerColor;
  ctx.lineWidth = 2.2;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  // 1. Tilted Phone Handset Silhouette
  ctx.beginPath();
  ctx.moveTo(-7, -4);
  ctx.lineTo(-4, -8);
  ctx.lineTo(-1, -5);
  ctx.lineTo(-2, -3);
  ctx.quadraticCurveTo(0, 1, 3, 2);
  ctx.lineTo(5, 0);
  ctx.lineTo(8, 3);
  ctx.lineTo(6, 7);
  ctx.quadraticCurveTo(0, 9, -6, 3);
  ctx.quadraticCurveTo(-9, -2, -7, -4);
  ctx.closePath();
  ctx.fill();

  // 2. Sound Waves (2 concentric ringing arcs emitting to top-right)
  ctx.beginPath();
  ctx.arc(-1, -1, 7, -Math.PI * 0.38, 0);
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(-1, -1, 11, -Math.PI * 0.38, 0);
  ctx.stroke();

  ctx.restore();
}

function drawVectorIconPin(ctx, x, y, size, color) {
  ctx.save();
  ctx.translate(x, y);

  // Solid Circle Badge Background
  ctx.beginPath();
  ctx.arc(0, 0, size / 2, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();

  const innerColor = 'rgba(15, 23, 42, 0.95)';
  ctx.fillStyle = innerColor;
  ctx.strokeStyle = innerColor;
  ctx.lineWidth = 2;

  // Clean Pin Silhouette
  ctx.beginPath();
  ctx.arc(0, -3, 4.5, 0, Math.PI * 2);
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(-4.5, -2);
  ctx.lineTo(0, 7.5);
  ctx.lineTo(4.5, -2);
  ctx.closePath();
  ctx.fill();

  // Inner cutout hole in pin head
  ctx.beginPath();
  ctx.arc(0, -3, 2, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();

  ctx.restore();
}

function drawCoverImage(ctx, img, x, y, w, h) {
  const imgRatio = img.width / img.height;
  const rectRatio = w / h;
  let sw, sh, sx, sy;

  if (imgRatio > rectRatio) {
    sh = img.height;
    sw = img.height * rectRatio;
    sx = (img.width - sw) / 2;
    sy = 0;
  } else {
    sw = img.width;
    sh = img.width / rectRatio;
    sx = 0;
    sy = (img.height - sh) / 2;
  }
  ctx.drawImage(img, sx, sy, sw, sh, x, y, w, h);
}

function wrapText(ctx, text, x, y, maxWidth, lineHeight) {
  const words = text.split(' ');
  let line = '';
  for (let n = 0; n < words.length; n++) {
    const testLine = line + words[n] + ' ';
    const metrics = ctx.measureText(testLine);
    const testWidth = metrics.width;
    if (testWidth > maxWidth && n > 0) {
      ctx.fillText(line, x, y);
      line = words[n] + ' ';
      y += lineHeight;
    } else {
      line = testLine;
    }
  }
  ctx.fillText(line, x, y);
}

function downloadStudioCanvasImage() {
  const canvas = document.getElementById('content-studio-canvas');
  if (!canvas) return;

  const dataUrl = canvas.toDataURL('image/png');
  const link = document.createElement('a');
  link.download = `fanpage-content-${Date.now()}.png`;
  link.href = dataUrl;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  showToast('Đã tải ảnh HD thành công!');
}

function copyStudioCanvasImage() {
  const canvas = document.getElementById('content-studio-canvas');
  if (!canvas) return;

  try {
    canvas.toBlob(blob => {
      if (!blob) {
        showToast('Không thể tạo blob ảnh!');
        return;
      }
      if (navigator.clipboard && window.ClipboardItem) {
        const item = new ClipboardItem({ 'image/png': blob });
        navigator.clipboard.write([item]).then(() => {
          showToast('Đã sao chép ảnh vào bộ nhớ tạm!');
        }).catch(err => {
          console.error('Copy canvas image failed:', err);
          showToast('Trình duyệt không hỗ trợ copy trực tiếp. Hãy dùng nút Tải Ảnh!');
        });
      } else {
        showToast('Trình duyệt không hỗ trợ copy trực tiếp. Hãy dùng nút Tải Ảnh!');
      }
    }, 'image/png');
  } catch (e) {
    console.error('Error copying canvas image:', e);
    showToast('Hãy dùng nút Tải Ảnh về máy!');
  }
}

async function publishToFacebookFanpage() {
  const info = getStoreInfo();
  const fbPageId = (info.fbPageId || '').trim();
  const fbPageToken = (info.fbPageToken || '').trim();

  if (!fbPageId || !fbPageToken) {
    alert('⚠️ CHƯA CẤU HÌNH FACEBOOK FANPAGE:\n\nBạn chưa điền Facebook Page ID hoặc Page Access Token.\n\nVui lòng vào menu "Thông tin cửa hàng" > cuộn xuống mục "Cấu hình Đăng bài Tự Động lên Facebook Fanpage" để điền ID và Token trước khi thực hiện!');
    switchView('store-settings');
    return;
  }

  const captionText = document.getElementById('studio-caption-output').value.trim();
  if (!captionText) {
    alert('Vui lòng tạo hoặc nhập bài viết trước khi đăng!');
    return;
  }

  const canvas = document.getElementById('content-studio-canvas');
  if (!canvas) {
    alert('Không tìm thấy khung ảnh Canvas!');
    return;
  }

  const btn = document.getElementById('btn-publish-fb');
  const originalBtnText = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = `<span style="display:inline-block; animation: spin 1s linear infinite; margin-right:6px;">⏳</span>Đang đăng bài lên Facebook Fanpage...`;

  try {
    // 1. Tự động kiểm tra & đổi từ Mã người dùng (User Token) sang Mã Trang (Page Access Token) chuẩn Facebook
    let effectivePageToken = fbPageToken;
    let targetPageId = fbPageId;

    try {
      // Thử lấy trực tiếp Page Access Token của Page ID
      const pageRes = await fetch(`https://graph.facebook.com/v19.0/${fbPageId}?fields=access_token,name&access_token=${fbPageToken}`);
      const pageData = await pageRes.json();
      if (pageData && pageData.access_token) {
        effectivePageToken = pageData.access_token;
        console.log("Đã tự động lấy Page Token chuẩn cho Trang:", pageData.name);
      } else {
        // Dự phòng: Lấy danh sách trang qua me/accounts
        const accountsRes = await fetch(`https://graph.facebook.com/v19.0/me/accounts?access_token=${fbPageToken}`);
        const accountsData = await accountsRes.json();
        if (accountsData && accountsData.data && accountsData.data.length > 0) {
          const matchedPage = accountsData.data.find(p => p.id === fbPageId) || accountsData.data[0];
          if (matchedPage && matchedPage.access_token) {
            effectivePageToken = matchedPage.access_token;
            if (!targetPageId) targetPageId = matchedPage.id;
            console.log("Đã lấy thành công Page Access Token từ me/accounts:", matchedPage.name);
          }
        }
      }
    } catch (tokenErr) {
      console.warn("Không thể tự chuyển đổi Token, sẽ thử đăng bằng Token hiện tại:", tokenErr);
    }

    // 2. Convert Canvas image to Blob
    const blob = await new Promise((resolve, reject) => {
      canvas.toBlob(b => b ? resolve(b) : reject(new Error('Không thể chuyển đổi canvas sang blob ảnh')), 'image/png');
    });

    // 3. Build FormData request payload for Meta Graph API
    const formData = new FormData();
    formData.append('access_token', effectivePageToken);
    formData.append('caption', captionText);
    formData.append('source', blob, `spa-giay-post-${Date.now()}.png`);

    // 4. Post to Facebook Page API endpoint
    const response = await fetch(`https://graph.facebook.com/v19.0/${targetPageId}/photos`, {
      method: 'POST',
      body: formData
    });

    const result = await response.json();

    if (response.ok && (result.id || result.post_id)) {
      const postId = result.post_id || result.id;
      showToast('🎉 Đã đăng bài tự động lên Facebook Fanpage thành công!');
      alert(`🎉 ĐÃ ĐĂNG BÀI THÀNH CÔNG LÊN FANPAGE!\n\nID Bài đăng Facebook: ${postId}\n\nQuý khách có thể vào Fanpage kiểm tra bài viết vừa đăng.`);
    } else {
      console.error("Facebook API Error response:", result);
      const errorMsg = result.error ? (result.error.message || JSON.stringify(result.error)) : 'Lỗi không xác định';
      const isTokenExpired = errorMsg.toLowerCase().includes('expired') || errorMsg.toLowerCase().includes('token') || (result.error && (result.error.code === 190 || result.error.code === 102));

      if (isTokenExpired) {
        if (confirm(`⚠️ TOKEN TRUY CẬP FACEBOOK ĐÃ HẾT HẠN:\n\nChi tiết lỗi từ Facebook: ${errorMsg}\n\nBạn có muốn chuyển sang mục "Thông tin cửa hàng" để dán Token mới ngay không?`)) {
          switchView('store-settings');
          setTimeout(() => {
            const tokenInput = document.getElementById('store-fb-page-token');
            if (tokenInput) {
              tokenInput.focus();
              tokenInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
          }, 300);
        }
      } else {
        alert(`⚠️ KHÔNG THỂ ĐĂNG BÀI LÊN FANPAGE:\n\nLỗi từ Facebook: ${errorMsg}\n\nVui lòng kiểm tra lại Page Access Token hoặc cấp quyền pages_manage_posts cho Token.`);
      }
    }
  } catch (err) {
    console.error("Lỗi khi kết nối Facebook Graph API:", err);
    alert(`⚠️ LỖI KẾT NỐI FACEBOOK GRAPH API:\n\nChi tiết lỗi: ${err.message}`);
  } finally {
    btn.disabled = false;
    btn.innerHTML = originalBtnText;
  }
}

// ==========================================
// 12. EXPENSES MANAGEMENT MODULE
// ==========================================
const EXPENSE_CATEGORIES = {
  rent: { name: '🏢 Mặt bằng / Cửa hàng', color: '#F59E0B', bg: 'rgba(245, 158, 11, 0.15)' },
  salaries: { name: '👥 Lương nhân viên & Phụ cấp', color: '#3B82F6', bg: 'rgba(59, 130, 246, 0.15)' },
  supplies: { name: '🧼 Dung dịch, Hóa chất & Vật tư', color: '#10B981', bg: 'rgba(16, 185, 129, 0.15)' },
  utilities: { name: '⚡ Điện, Nước & Internet', color: '#8B5CF6', bg: 'rgba(139, 92, 246, 0.15)' },
  marketing: { name: '📢 Quảng cáo & Marketing', color: '#EC4899', bg: 'rgba(236, 72, 153, 0.15)' },
  other: { name: '📦 Chi phí khác', color: '#6B7280', bg: 'rgba(107, 114, 128, 0.15)' }
};

function renderExpenses() {
  const tbody = document.getElementById('expenses-table-body');
  if (!tbody) return;
  tbody.innerHTML = '';

  const monthFilter = document.getElementById('exp-filter-month') ? document.getElementById('exp-filter-month').value : 'all';
  const yearFilter = document.getElementById('exp-filter-year') ? document.getElementById('exp-filter-year').value : 'all';
  const catFilter = document.getElementById('exp-filter-category') ? document.getElementById('exp-filter-category').value : 'all';

  let filtered = state.expenses || [];

  // Filter by date (month/year)
  filtered = filtered.filter(e => isDateMatch(e.date, null, monthFilter, yearFilter));

  // Filter by category
  if (catFilter !== 'all') {
    filtered = filtered.filter(e => e.category === catFilter);
  }

  // Sort newest first
  filtered.sort((a, b) => new Date(b.date) - new Date(a.date));

  // Update Summary Stats
  const totalAmount = filtered.reduce((sum, e) => sum + Number(e.amount || 0), 0);
  const rentUtilAmount = filtered.filter(e => e.category === 'rent' || e.category === 'utilities').reduce((sum, e) => sum + Number(e.amount || 0), 0);
  const salariesAmount = filtered.filter(e => e.category === 'salaries').reduce((sum, e) => sum + Number(e.amount || 0), 0);
  const suppliesOtherAmount = filtered.filter(e => e.category === 'supplies' || e.category === 'marketing' || e.category === 'other').reduce((sum, e) => sum + Number(e.amount || 0), 0);

  const statTotal = document.getElementById('exp-stat-total');
  if (statTotal) statTotal.textContent = formatVND(totalAmount);
  const statRU = document.getElementById('exp-stat-rent-utilities');
  if (statRU) statRU.textContent = formatVND(rentUtilAmount);
  const statSal = document.getElementById('exp-stat-salaries');
  if (statSal) statSal.textContent = formatVND(salariesAmount);
  const statSO = document.getElementById('exp-stat-supplies-other');
  if (statSO) statSO.textContent = formatVND(suppliesOtherAmount);

  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" class="text-center" style="padding: 30px; color: var(--text-light);">Không tìm thấy khoản chi phí nào</td></tr>`;
    return;
  }

  filtered.forEach(exp => {
    const tr = document.createElement('tr');

    const catMeta = EXPENSE_CATEGORIES[exp.category] || { name: exp.categoryName || 'Chi phí khác', color: '#6B7280', bg: 'rgba(107, 114, 128, 0.15)' };

    tr.innerHTML = `
      <td style="font-weight: 700; color: var(--color-brand-brown-dark);">${exp.id}</td>
      <td style="white-space: nowrap;">${formatDateTime(exp.date).split(' ')[0]}</td>
      <td>
        <span class="badge" style="background-color: ${catMeta.bg}; color: ${catMeta.color}; font-weight: 600; padding: 4px 10px; border-radius: 12px;">
          ${catMeta.name}
        </span>
      </td>
      <td>
        <div style="font-weight: 600; max-width: 280px;">${exp.description}</div>
      </td>
      <td style="font-weight: 700; color: #EF4444;">${formatVND(exp.amount)}</td>
      <td style="font-size: 0.85rem; color: var(--text-secondary);">${exp.creator || 'Admin'}</td>
      <td style="text-align: right; white-space: nowrap;">
        <button class="action-btn edit" onclick="openExpenseModal('${exp.id}')" title="Sửa khoản chi">
          <svg viewBox="0 0 24 24"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg>
        </button>
        <button class="action-btn delete" onclick="deleteExpense('${exp.id}')" title="Xóa khoản chi">
          <svg viewBox="0 0 24 24"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
        </button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

function resetExpenseFilters() {
  if (document.getElementById('exp-filter-month')) document.getElementById('exp-filter-month').value = 'all';
  if (document.getElementById('exp-filter-year')) document.getElementById('exp-filter-year').value = 'all';
  if (document.getElementById('exp-filter-category')) document.getElementById('exp-filter-category').value = 'all';
  renderExpenses();
}

function openExpenseModal(expId = null) {
  const modal = document.getElementById('expense-modal');
  const title = document.getElementById('expense-modal-title');
  const submitBtn = document.getElementById('expense-submit-btn');

  if (expId) {
    const exp = (state.expenses || []).find(e => e.id === expId);
    if (!exp) return;
    state.currentEditingExpense = exp;
    title.textContent = 'Chỉnh Sửa Khoản Chi';
    submitBtn.textContent = 'Cập nhật khoản chi';

    document.getElementById('exp-id').value = exp.id;
    document.getElementById('exp-date').value = exp.date;
    document.getElementById('exp-category').value = exp.category;
    document.getElementById('exp-amount').value = exp.amount;
    document.getElementById('exp-description').value = exp.description;
  } else {
    state.currentEditingExpense = null;
    title.textContent = 'Thêm Khoản Chi Mới';
    submitBtn.textContent = 'Lưu khoản chi';

    document.getElementById('exp-id').value = '';
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('exp-date').value = today;
    document.getElementById('exp-category').value = 'rent';
    document.getElementById('exp-amount').value = '';
    document.getElementById('exp-description').value = '';
  }

  modal.classList.add('active');
}

function closeExpenseModal() {
  const modal = document.getElementById('expense-modal');
  if (modal) modal.classList.remove('active');
  state.currentEditingExpense = null;
}

async function handleExpenseSubmit(event) {
  event.preventDefault();

  const id = document.getElementById('exp-id').value.trim();
  const date = document.getElementById('exp-date').value;
  const category = document.getElementById('exp-category').value;
  const amount = Number(document.getElementById('exp-amount').value);
  const description = document.getElementById('exp-description').value.trim();

  if (!date || !amount || amount <= 0 || !description) {
    alert('Vui lòng nhập đầy đủ và chính xác thông tin khoản chi!');
    return;
  }

  const catMeta = EXPENSE_CATEGORIES[category] || { name: 'Chi phí khác' };
  const creator = state.currentUser ? state.currentUser.name : 'Admin';

  let expObj;

  if (id) {
    // Edit existing expense
    const existing = state.expenses.find(e => e.id === id);
    if (existing) {
      existing.date = date;
      existing.category = category;
      existing.categoryName = catMeta.name;
      existing.amount = amount;
      existing.description = description;
      existing.updatedAt = new Date().toISOString();
      expObj = existing;
    }
  } else {
    // Create new expense
    const newId = 'EXP-' + String(Date.now()).slice(-6);
    expObj = {
      id: newId,
      storeId: getCurrentStoreId(),
      date: date,
      category: category,
      categoryName: catMeta.name,
      amount: amount,
      description: description,
      creator: creator,
      createdAt: new Date().toISOString()
    };
    state.expenses.push(expObj);
  }

  // Save to localStorage
  saveState('pb_v2_expenses', state.expenses);

  // Sync to Firebase Cloud V2 if available
  if (window.db && expObj) {
    try {
      await window.db.collection('v2_expenses').doc(expObj.id).set(expObj);
      console.log(`Synced expense ${expObj.id} to Firebase Cloud V2.`);
    } catch (e) {
      console.error("Error syncing expense to Firebase V2:", e);
    }
  }

  closeExpenseModal();
  renderExpenses();
  renderDashboard();
  showToast(id ? 'Cập nhật khoản chi thành công!' : 'Đã thêm khoản chi mới thành công!');
}

async function deleteExpense(expId) {
  if (!confirm('Bạn có chắc chắn muốn xóa khoản chi phí này?')) return;

  state.expenses = state.expenses.filter(e => e.id !== expId);
  saveState('pb_v2_expenses', state.expenses);

  if (window.db) {
    try {
      await window.db.collection('v2_expenses').doc(expId).delete();
      console.log(`Deleted expense ${expId} from Firebase Cloud V2.`);
    } catch (e) {
      console.error("Error deleting expense from Firebase V2:", e);
    }
  }

  renderExpenses();
  renderDashboard();
  showToast('Đã xóa khoản chi phí thành công!');
}

// Window Global Exports for HTML Event Handlers
if (typeof window !== 'undefined') {
  window.toggleAuthTab = toggleAuthTab;
  window.handleRegister = handleRegister;
  window.handleLogin = handleLogin;
  window.handleLogout = handleLogout;
  window.renderSaasAdminView = renderSaasAdminView;
  window.openActivatePackageModal = openActivatePackageModal;
  window.closeActivatePackageModal = closeActivatePackageModal;
  window.updateActivatePackageDuration = updateActivatePackageDuration;
  window.handleActivatePackageSubmit = handleActivatePackageSubmit;
  window.toggleUserLock = toggleUserLock;
  window.deleteUserAccount = deleteUserAccount;
  window.checkUserActivationStatus = checkUserActivationStatus;
}



