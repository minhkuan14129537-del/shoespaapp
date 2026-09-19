// Default data for Shoe Spa Order Management Webapp

const DEFAULT_SERVICES = [
  // VỆ SINH GIÀY
  { id: 'vs-giay', storeId: 'store_phuibui', name: 'Vệ sinh giày', category: 'Vệ sinh giày', defaultPrice: 80000, priceRange: '60.000 - 100.000đ' },
  { id: 'vs-tre-em', storeId: 'store_phuibui', name: 'Vệ sinh giày trẻ em', category: 'Vệ sinh giày', defaultPrice: 40000, priceRange: '40.000đ' },
  { id: 'vs-da-boot', storeId: 'store_phuibui', name: 'Vệ sinh giày da, boot, da lộn', category: 'Vệ sinh giày', defaultPrice: 105000, priceRange: '90.000 - 120.000đ' },
  { id: 'vs-dep', storeId: 'store_phuibui', name: 'Vệ sinh dép', category: 'Vệ sinh giày', defaultPrice: 45000, priceRange: '45.000đ' },

  // THAY ĐẾ GIÀY
  { id: 'thay-de-the-thao', storeId: 'store_phuibui', name: 'Thay đế giày thể thao', category: 'Thay đế giày', defaultPrice: 400000, priceRange: '350.000 - 450.000đ' },

  // TẨY Ố
  { id: 'tay-o-than', storeId: 'store_phuibui', name: 'Tẩy ố, mốc thân giày', category: 'Tẩy ố', defaultPrice: 120000, priceRange: '120.000đ' },
  { id: 'tay-o-de', storeId: 'store_phuibui', name: 'Tẩy ố đế', category: 'Tẩy ố', defaultPrice: 150000, priceRange: '150.000đ' },

  // REPAINT
  { id: 'repaint-de', storeId: 'store_phuibui', name: 'Repaint đế', category: 'Repaint', defaultPrice: 200000, priceRange: '200.000đ' },
  { id: 'repaint-than', storeId: 'store_phuibui', name: 'Repaint thân', category: 'Repaint', defaultPrice: 300000, priceRange: '200.000 - 400.000đ' },

  // DÁN ĐẾ GIÀY
  { id: 'dan-bong-keo', storeId: 'store_phuibui', name: 'Dán bong keo', category: 'Dán đế giày', defaultPrice: 140000, priceRange: '30.000 - 250.000đ' },
  { id: 'dan-de-the-thao', storeId: 'store_phuibui', name: 'Dán đế giày thể thao', category: 'Dán đế giày', defaultPrice: 310000, priceRange: '270.000 - 350.000đ' },
  { id: 'dan-de-cao-su', storeId: 'store_phuibui', name: 'Dán đế cao su', category: 'Dán đế giày', defaultPrice: 300000, priceRange: '200.000 - 400.000đ' }
];

const SUBSCRIPTION_PACKAGES = [
  { id: 'trial', name: 'Gói Dùng Thử (7 ngày)', price: 0, durationDays: 7, desc: 'Trải nghiệm đầy đủ tính năng quản lý cửa hàng trong 7 ngày' },
  { id: 'monthly', name: 'Gói Tiêu Chuẩn (1 tháng)', price: 199000, durationDays: 30, desc: 'Dành cho 1 cửa hàng Spa giày vừa & nhỏ' },
  { id: 'yearly', name: 'Gói Chuyên Nghiệp (1 năm)', price: 1990000, durationDays: 365, desc: 'Tiết kiệm 17% - Tặng kèm mẫu in hóa đơn thương hiệu' },
  { id: 'vip', name: 'Gói VIP Vĩnh Viễn', price: 4990000, durationDays: 36500, desc: 'Không giới hạn thời gian & không đóng phí duy trì hàng năm' }
];

const DEFAULT_USERS = [
  { 
    id: 'u-superadmin', 
    storeId: 'system',
    email: 'superadmin@shoespaapp.vn', 
    password: 'superadmin', 
    name: 'Super Admin Hệ Thống', 
    phone: '0906227512', 
    storeName: 'Hệ Thống Shoespaapp', 
    role: 'superadmin', 
    status: 'active', 
    package: 'vip', 
    packageStatus: 'active', 
    expiresAt: '2099-12-31',
    createdAt: '2026-01-01T00:00:00.000Z' 
  },
  { 
    id: 'u-admin', 
    storeId: 'store_phuibui',
    email: 'admin@phuibui.vn', 
    password: 'admin', 
    name: 'Nguyễn Văn Admin', 
    phone: '0906227512', 
    storeName: 'SPA GIÀY PHỦI BỤI', 
    role: 'admin', 
    status: 'active', 
    package: 'yearly', 
    packageStatus: 'active', 
    expiresAt: '2029-12-31',
    createdAt: '2026-01-01T00:00:00.000Z' 
  },
  { 
    id: 'u-staff-1', 
    storeId: 'store_phuibui',
    email: 'nhanvien@phuibui.vn', 
    password: 'staff', 
    name: 'Trần Văn Nhân Viên', 
    phone: '0912345678', 
    storeName: 'SPA GIÀY PHỦI BỤI', 
    role: 'staff', 
    status: 'active', 
    package: 'yearly', 
    packageStatus: 'active', 
    expiresAt: '2029-12-31',
    createdAt: '2026-01-01T00:00:00.000Z' 
  },
  { 
    id: 'u-staff-2', 
    storeId: 'store_phuibui',
    email: 'hoang.nv@phuibui.vn', 
    password: 'staff', 
    name: 'Hoàng Nhân Viên', 
    phone: '0987654321', 
    storeName: 'SPA GIÀY PHỦI BỤI', 
    role: 'staff', 
    status: 'active', 
    package: 'yearly', 
    packageStatus: 'active', 
    expiresAt: '2029-12-31',
    createdAt: '2026-01-01T00:00:00.000Z' 
  }
];

const DEFAULT_STORE_INFO = {
  storeId: 'store_phuibui',
  name: 'SPA GIÀY',
  subtitle: 'SHOE SPA & REPAIR',
  hotline: '0906 22 7512',
  address: 'N07C - LK19, VẠN PHÚC, HÀ ĐÔNG, HÀ NỘI',
  logoUrl: '',
  orderPrefix: 'PB',
  receiptNote: 'Cảm ơn quý khách đã tin tưởng dịch vụ của chúng tôi!\nQuý khách vui lòng mang hóa đơn này khi nhận lại giày.'
};

const DEFAULT_EXPENSES = [];

if (typeof window !== 'undefined') {
  window.SUBSCRIPTION_PACKAGES = SUBSCRIPTION_PACKAGES;
  window.DEFAULT_SERVICES = DEFAULT_SERVICES;
  window.DEFAULT_USERS = DEFAULT_USERS;
  window.BRAND_INFO = DEFAULT_STORE_INFO;
  window.DEFAULT_STORE_INFO = DEFAULT_STORE_INFO;
  window.INITIAL_ORDERS = typeof INITIAL_ORDERS !== 'undefined' ? INITIAL_ORDERS : [];
  window.DEFAULT_EXPENSES = DEFAULT_EXPENSES;
}

