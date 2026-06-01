import { createRouter, createWebHashHistory } from 'vue-router'
import { useUserStore } from '@/stores/user'

const routes = [
  {
    path: '/login',
    name: 'Login',
    component: () => import('@/views/login/LoginView.vue'),
    meta: { requiresAuth: false }
  },
  {
    path: '/',
    component: () => import('@/components/AppLayout.vue'),
    redirect: '/dashboard',
    children: [
      {
        path: 'dashboard',
        name: 'Dashboard',
        component: () => import('@/views/dashboard/DashboardView.vue'),
        meta: { requiresAuth: true, title: '仪表盘' }
      },
      {
        path: 'report',
        name: 'Report',
        component: () => import('@/views/report/ReportView.vue'),
        meta: { requiresAuth: true, title: '报表中心' }
      },
      {
        path: 'cars',
        name: 'Cars',
        component: () => import('@/views/car/CarListView.vue'),
        meta: { requiresAuth: true, title: '车辆管理' }
      },
      {
        path: 'cars/add',
        name: 'CarAdd',
        component: () => import('@/views/car/CarAddView.vue'),
        meta: { requiresAuth: true, title: '新增车辆' }
      },
      {
        path: 'orders',
        name: 'Orders',
        component: () => import('@/views/order/OrderListView.vue'),
        meta: { requiresAuth: true, title: '工单管理' }
      },
      {
        path: 'orders/add',
        name: 'OrderAdd',
        component: () => import('@/views/order/OrderAddView.vue'),
        meta: { requiresAuth: true, title: '新开工单' }
      },
      {
        path: 'members',
        name: 'Members',
        component: () => import('@/views/member/MemberListView.vue'),
        meta: { requiresAuth: true, title: '会员管理' }
      },
      {
        path: 'members/add',
        name: 'MemberAdd',
        component: () => import('@/views/member/MemberAddView.vue'),
        meta: { requiresAuth: true, title: '新增会员' }
      },
      {
        path: 'inventory',
        redirect: '/inventory/products',
        children: [
          {
            path: 'products',
            name: 'Products',
            component: () => import('@/views/inventory/ProductListView.vue'),
            meta: { requiresAuth: true, title: '商品管理' }
          },
          {
            path: 'products/add',
            name: 'ProductAdd',
            component: () => import('@/views/inventory/ProductAddView.vue'),
            meta: { requiresAuth: true, title: '新增商品' }
          },
          {
            path: 'products/:id',
            name: 'ProductDetail',
            component: () => import('@/views/inventory/ProductDetailView.vue'),
            meta: { requiresAuth: true, title: '商品详情' }
          },
          {
            path: 'products/:id/edit',
            name: 'ProductEdit',
            component: () => import('@/views/inventory/ProductAddView.vue'),
            meta: { requiresAuth: true, title: '编辑商品' }
          },
          {
            path: 'stock-in',
            name: 'StockIn',
            component: () => import('@/views/inventory/StockInView.vue'),
            meta: { requiresAuth: true, title: '入库管理' }
          },
          {
            path: 'receipts',
            name: 'Receipts',
            component: () => import('@/views/inventory/ReceiptListView.vue'),
            meta: { requiresAuth: true, title: '入库单列表' }
          },
          {
            path: 'receipts/:batchId',
            name: 'ReceiptDetail',
            component: () => import('@/views/inventory/ReceiptDetailView.vue'),
            meta: { requiresAuth: true, title: '入库单详情' }
          }
        ]
      },
      {
        path: 'settings',
        name: 'Settings',
        component: () => import('@/views/settings/ShopSettingsView.vue'),
        meta: { requiresAuth: true, title: '门店设置' }
      }
    ]
  }
]

const router = createRouter({
  history: createWebHashHistory(),
  routes
})

// 导航守卫
router.beforeEach((to, from, next) => {
  const userStore = useUserStore()

  if (to.meta.requiresAuth) {
    if (!userStore.isLoggedIn) {
      return next('/login')
    }
    // 防止 token 篡改：员工角色不可访问 Web 后台
    if (userStore.isStaff) {
      userStore.logout()
      return next('/login')
    }
  }

  // 已登录时访问登录页 → 跳首页
  if (to.path === '/login' && userStore.isLoggedIn) {
    return next('/dashboard')
  }

  next()
})

export default router
