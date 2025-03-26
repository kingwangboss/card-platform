// 在文件顶部添加调试开关
const DEBUG = true; // 设置为 false 可禁用所有调试输出

// 创建自定义日志函数
const logger = {
  log: (...args) => DEBUG && console.log(...args),
  info: (...args) => DEBUG && console.info(...args),
  warn: (...args) => console.warn(...args), // 警告通常保留
  error: (...args) => console.error(...args) // 错误通常保留
};

const { createApp, ref, onMounted, computed, watch } = Vue;

const app = createApp({
    setup() {
        // Auth state
        const token = ref(localStorage.getItem('token') || '');
        const currentUser = ref(JSON.parse(localStorage.getItem('user') || 'null'));
        const isLoggedIn = computed(() => !!token.value);
        const loginForm = ref({ username: '', password: '' });
        const loginError = ref('');

        // View state
        const currentView = ref('cards');
        
        // Cards state
        const cards = ref([]);
        const filteredCards = computed(() => {
            if (!searchQuery.value) return cards.value;
            const query = searchQuery.value.toLowerCase();
            return cards.value.filter(card => 
                card.card_number.toLowerCase().includes(query) || 
                (card.status && card.status.toLowerCase().includes(query))
            );
        });
        const searchQuery = ref('');
        const showGenerateCardModal = ref(false);
        const cardForm = ref({
            count: 1,
            validity_days: 30,
            prefix: '',
            batch_name: ''
        });
        
        // Users state
        const users = ref([]);
        const showCreateUserModal = ref(false);
        const editingUser = ref(null);
        const userForm = ref({
            username: '',
            password: '',
            email: '',
            role: 'User'
        });

        // API client setup
        const api = axios.create({
            baseURL: '/',
            headers: {
                'Content-Type': 'application/json'
            }
        });

        // 修改 toggleNavbar 函数，确保只在移动设备上工作
        const toggleNavbar = () => {
            // 只在小屏幕上执行折叠操作
            if (window.innerWidth < 992) { // Bootstrap lg 断点是 992px
                const navbarCollapse = document.getElementById('navbarNav');
                if (!navbarCollapse) return;
                
                navbarCollapse.classList.remove('show');
                navbarCollapse.style.display = 'none';
                
                // 同时更新 toggler 按钮状态
                const toggler = document.querySelector('.navbar-toggler');
                if (toggler) toggler.classList.add('collapsed');
            }
        };

        api.interceptors.request.use(
            config => {
                const token = localStorage.getItem('token');
                if (token) {
                    config.headers['Authorization'] = `Bearer ${token}`;
                }
                return config;
            },
            error => Promise.reject(error)
        );

        api.interceptors.response.use(
            response => response,
            error => {
                console.error('API Error:', error.response ? error.response.status : error.message);
                
                if (error.response) {
                    // 处理 401 错误（未授权）
                    if (error.response.status === 401) {
                        console.warn('Unauthorized access detected');
                        // 检查错误消息是否包含令牌无效的信息
                        const errorMsg = error.response.data;
                        console.log('Error message:', errorMsg);
                        
                        if (typeof errorMsg === 'string' && 
                            (errorMsg.includes('Invalid token') || 
                             errorMsg.includes('Authorization header missing or invalid'))) {
                            console.warn('Token invalidated, logging out user');
                            // 显示被挤下线的提示
                            alert('您的账号已在其他设备登录，请重新登录');
                            // 执行登出操作
                            localStorage.removeItem('token');
                            localStorage.removeItem('user');
                            // 重定向到登录页面
                            window.location.reload();
                            return Promise.reject(new Error('Logged out due to invalid token'));
                        }
                    }
                }
                return Promise.reject(error);
            }
        );

        // Auth methods
        const login = async () => {
            try {
                logger.info('Attempting login for:', loginForm.value.username);
                loginError.value = '';
                const response = await api.post('/api/users/login', loginForm.value);
                token.value = response.data.token;
                currentUser.value = response.data.user;
                localStorage.setItem('token', token.value);
                localStorage.setItem('user', JSON.stringify(currentUser.value));
                loginForm.value = { username: '', password: '' };
                
                logger.info('Login successful, user:', currentUser.value.username);
                
                // 登录成功后获取卡密列表
                await fetchCards();
                
                // 如果是管理员且当前视图是用户管理，获取用户列表
                if (currentUser.value && currentUser.value.role === 'ADMIN' && currentView.value === 'users') {
                    await fetchUsers();
                }
            } catch (error) {
                logger.error('Login error:', error);
                if (error.response && error.response.data) {
                    loginError.value = error.response.data;
                } else {
                    loginError.value = '登录失败，请稍后再试';
                }
            }
        };

        const logout = () => {
            logger.info('Logging out user');
            token.value = '';
            currentUser.value = null;
            localStorage.removeItem('token');
            localStorage.removeItem('user');
            cards.value = [];
            users.value = [];
        };

        // Card methods
        const fetchCards = async () => {
            try {
                logger.info('Fetching cards...');
                if (!token.value) {
                    throw new Error('No token found');
                }
                
                const response = await api.get('/api/cards');
                cards.value = response.data;
                logger.info('Cards loaded:', cards.value.length);
            } catch (error) {
                logger.error('Error fetching cards:', error);
                if (error.response && error.response.status === 401) {
                    // 令牌无效，可能是被挤下线
                    logger.warn('Unauthorized access when fetching cards, possible token invalidation');
                } else {
                    console.error('初始化数据失败:', error.message);
                }
            }
        };

        const searchCards = () => {
            logger.info('Searching cards with query:', searchQuery.value);
        };

        const generateCard = async () => {
            try {
                logger.info('Generating cards:', cardForm.value);
                const response = await api.post('/api/cards/generate', cardForm.value);
                cards.value = [...cards.value, ...response.data];
                showGenerateCardModal.value = false;
                cardForm.value = {
                    count: 1,
                    validity_days: 30,
                    prefix: '',
                    batch_name: ''
                };
                logger.info('Cards generated successfully');
            } catch (error) {
                logger.error('Error generating cards:', error);
                alert('生成卡密失败: ' + (error.response?.data || error.message));
            }
        };

        const deleteCard = async (id) => {
            if (!confirm('确定要删除这个卡密吗？')) return;
            
            try {
                logger.info('Deleting card:', id);
                await api.delete(`/api/cards/${id}`);
                cards.value = cards.value.filter(card => card._id !== id);
                logger.info('Card deleted successfully');
            } catch (error) {
                logger.error('Error deleting card:', error);
                alert('删除卡密失败: ' + (error.response?.data || error.message));
            }
        };

        const exportCards = async () => {
            try {
                logger.info('Exporting cards');
                const response = await api.get('/api/cards/export', { responseType: 'blob' });
                const url = window.URL.createObjectURL(new Blob([response.data]));
                const link = document.createElement('a');
                link.href = url;
                link.setAttribute('download', 'cards.csv');
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                logger.info('Cards exported successfully');
            } catch (error) {
                logger.error('Error exporting cards:', error);
                alert('导出卡密失败: ' + error.message);
            }
        };

        // User methods
        const fetchUsers = async () => {
            try {
                logger.info('Fetching users...');
                if (!token.value || !currentUser.value || currentUser.value.role !== 'ADMIN') {
                    logger.warn('Not authorized to fetch users');
                    return;
                }
                
                const response = await api.get('/api/users');
                users.value = response.data;
                logger.info('Users loaded:', users.value.length);
            } catch (error) {
                logger.error('Error fetching users:', error);
                if (error.response && error.response.status === 401) {
                    // 令牌无效，可能是被挤下线
                    logger.warn('Unauthorized access when fetching users, possible token invalidation');
                }
            }
        };

        const editUser = (user) => {
            logger.info('Editing user:', user.username);
            editingUser.value = user.id;
            userForm.value = {
                username: user.username,
                password: '',
                email: user.email || '',
                role: user.role
            };
            showCreateUserModal.value = true;
        };

        const closeUserModal = () => {
            logger.info('Closing user modal');
            showCreateUserModal.value = false;
            editingUser.value = null;
            userForm.value = {
                username: '',
                password: '',
                email: '',
                role: 'User'
            };
        };

        const saveUser = async () => {
            try {
                if (editingUser.value) {
                    // 更新用户
                    logger.info('Updating user:', editingUser.value);
                    const updateData = {
                        ...userForm.value
                    };
                    if (!updateData.password) {
                        delete updateData.password;
                    }
                    
                    await api.put(`/api/users/${editingUser.value}`, updateData);
                    const index = users.value.findIndex(u => u.id === editingUser.value);
                    if (index !== -1) {
                        users.value[index] = {
                            ...users.value[index],
                            username: userForm.value.username,
                            email: userForm.value.email,
                            role: userForm.value.role
                        };
                    }
                    logger.info('User updated successfully');
                } else {
                    // 创建用户
                    logger.info('Creating new user:', userForm.value.username);
                    const response = await api.post('/api/users/register', userForm.value);
                    users.value.push(response.data);
                    logger.info('User created successfully');
                }
                
                closeUserModal();
            } catch (error) {
                logger.error('Error saving user:', error);
                alert('保存用户失败: ' + (error.response?.data || error.message));
            }
        };

        const deleteUser = async (id) => {
            if (!confirm('确定要删除这个用户吗？')) return;
            
            try {
                logger.info('Deleting user:', id);
                await api.delete(`/api/users/${id}`);
                users.value = users.value.filter(user => user.id !== id);
                logger.info('User deleted successfully');
            } catch (error) {
                logger.error('Error deleting user:', error);
                alert('删除用户失败: ' + (error.response?.data || error.message));
            }
        };

        // Utility methods
        const formatDate = (dateString) => {
            if (!dateString) return '未设置';
            const date = new Date(dateString);
            return date.toLocaleString();
        };

        // 获取当前用户信息
        const getCurrentUser = async () => {
            try {
                // 先检查 localStorage 中是否有 token
                const storedToken = localStorage.getItem('token');
                if (!storedToken) {
                    logger.log('No token found in localStorage');
                    return Promise.reject('No token found');
                }
                
                // 确保 token 值被正确设置
                token.value = storedToken;
                
                // 尝试获取当前用户信息
                const response = await api.get('/api/users/me');
                currentUser.value = response.data;
                localStorage.setItem('user', JSON.stringify(currentUser.value));
                logger.log('Current user fetched:', currentUser.value);
                
                return Promise.resolve(currentUser.value);
            } catch (error) {
                logger.error('Error fetching current user:', error);
                return Promise.reject(error);
            }
        };

        // 添加一个 watch 来监视 currentView 的变化
        watch(currentView, async (newView) => {
            logger.info('View changed to:', newView);
            if (newView === 'users' && currentUser.value && currentUser.value.role === 'ADMIN') {
                await fetchUsers();
            }
        });

        // 修改 onMounted 钩子中的代码，确保数据正确加载
        onMounted(() => {
            // 根据屏幕尺寸设置导航栏的初始状态
            const navbarCollapse = document.getElementById('navbarNav');
            if (navbarCollapse) {
                if (window.innerWidth < 992) {
                    // 小屏幕上折叠导航栏
                    navbarCollapse.classList.remove('show');
                    navbarCollapse.style.display = 'none';
                } else {
                    // 大屏幕上显示导航栏
                    navbarCollapse.style.display = 'flex';
                }
            }
            
            // 确保获取当前用户信息
            getCurrentUser().then(() => {
                // 无论当前视图是什么，都加载卡密列表
                fetchCards();
                
                // 如果是管理员且当前视图是用户管理，加载用户列表
                if (currentUser.value?.role === 'ADMIN' && currentView.value === 'users') {
                    fetchUsers();
                }
            }).catch(error => {
                logger.error('初始化数据失败:', error);
                // 如果获取用户信息失败，可能是登录过期，执行登出操作
                logout();
            });
        });

        return {
            // Auth
            isLoggedIn,
            currentUser,
            loginForm,
            loginError,
            login,
            logout,
            
            // View
            currentView,
            toggleNavbar,
            
            // Cards
            cards,
            filteredCards,
            searchQuery,
            showGenerateCardModal,
            cardForm,
            fetchCards,
            searchCards,
            generateCard,
            deleteCard,
            exportCards,
            
            // Users
            users,
            showCreateUserModal,
            editingUser,
            userForm,
            fetchUsers,
            editUser,
            closeUserModal,
            saveUser,
            deleteUser,
            
            // Utils
            formatDate
        };
    }
});

app.mount('#app'); 