const app = Vue.createApp({
  data() {
    return {
      user: null,
      // ... 其他状态
    }
  },
  computed: {
    userRole() {
      return this.user?.role || 'USER' // 提供默认值
    },
    isAdmin() {
      return this.user?.role === 'ADMIN'
    }
  },
  async created() {
    try {
      // 获取用户信息
      const token = localStorage.getItem('token')
      if (token) {
        const response = await fetch('/api/users/me', {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        })
        if (response.ok) {
          this.user = await response.json()
        } else {
          localStorage.removeItem('token')
        }
      }
    } catch (error) {
      console.error('Failed to fetch user info:', error)
    }
  },
  // ... 其他方法
}) 