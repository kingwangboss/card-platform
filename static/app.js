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
        const cardSearchQuery = ref('');
        const showGenerateCardModal = ref(false);
        const cardForm = ref({ duration_days: 30, count: 1 });
        
        // Computed properties
        const filteredCards = computed(() => {
            if (!cardSearchQuery.value) return cards.value;
            const query = cardSearchQuery.value.toLowerCase();
            return cards.value.filter(card => 
                card.card_number.toLowerCase().includes(query)
            );
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
            baseURL: '/api',
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

        api.interceptors.request.use(config => {
            if (token.value) {
                config.headers.Authorization = `Bearer ${token.value}`;
            }
            return config;
        });

        api.interceptors.response.use(
            response => response,
            error => {
                if (error.response && error.response.status === 401) {
                    logout();
                }
                return Promise.reject(error);
            }
        );

        // Auth methods
        const login = async () => {
            try {
                loginError.value = '';
                const response = await api.post('/users/login', loginForm.value);
                token.value = response.data.token;
                currentUser.value = response.data.user;
                localStorage.setItem('token', token.value);
                localStorage.setItem('user', JSON.stringify(currentUser.value));
                loginForm.value = { username: '', password: '' };
                
                // 使用 logger 替代 console.log
                logger.log('Login response:', response.data);
                logger.log('Current user after login:', currentUser.value);
                
                await fetchCards();
                if (currentUser.value.role === 'ADMIN') {
                    logger.log('Current user role:', currentUser.value.role);
                    logger.log('Fetching users for admin...');
                    await fetchUsers();
                }
            } catch (error) {
                logger.error('Login error:', error);
                loginError.value = error.response?.data?.message || '登录失败，请检查用户名和密码';
            }
        };

        const logout = () => {
            token.value = '';
            currentUser.value = null;
            localStorage.removeItem('token');
            localStorage.removeItem('user');
            users.value = [];
            currentView.value = 'cards';
        };

        // Card methods
        const fetchCards = async () => {
            try {
                const response = await api.get('/cards');
                // 确保所有卡密数据的ID格式一致
                cards.value = response.data.map(card => {
                    if (card._id && typeof card._id === 'string') {
                        return {
                            ...card,
                            _id: { $oid: card._id }
                        };
                    }
                    return card;
                });
            } catch (error) {
                alert('获取卡密列表失败');
            }
        };

        const searchCards = () => {
            // The filtering is handled by the computed property
            // This function is just for the button click
        };

        const generateCard = async () => {
            try {
                const count = parseInt(cardForm.value.count);
                for (let i = 0; i < count; i++) {
                    const response = await api.post('/cards/generate', {
                        duration_days: parseInt(cardForm.value.duration_days)
                    });
                    
                    // 处理返回的卡密数据
                    let newCard = response.data;
                    
                    // 检查并规范化 _id 格式
                    if (newCard._id) {
                        if (typeof newCard._id === 'string') {
                            newCard = {
                                ...newCard,
                                _id: { $oid: newCard._id }
                            };
                        }
                    } else if (newCard.id) {
                        newCard = {
                            ...newCard,
                            _id: { $oid: newCard.id }
                        };
                    } else {
                        // 如果没有 _id 或 id，使用 card_number 作为临时 ID
                        newCard = {
                            ...newCard,
                            _id: { $oid: newCard.card_number }
                        };
                    }
                    
                    cards.value.unshift(newCard);
                }
                showGenerateCardModal.value = false;
                cardForm.value = { duration_days: 30, count: 1 };
                
                // 生成完成后重新获取卡密列表
                await fetchCards();
            } catch (error) {
                alert('生成卡密失败');
            }
        };

        const deleteCard = async (card) => {
            if (!confirm(`确定要删除卡号为 ${card.card_number} 的卡密吗？`)) {
                return;
            }

            try {
                // 获取卡密ID
                let cardId;
                if (card._id?.$oid) {
                    cardId = card._id.$oid;
                } else if (typeof card._id === 'string') {
                    cardId = card._id;
                } else if (card.id) {
                    cardId = card.id;
                } else if (card.card_number) {
                    // 如果没有 ID，使用卡号
                    cardId = card.card_number;
                } else {
                    throw new Error('无法找到卡密ID');
                }

                await api.delete(`/cards/${cardId}`);
                
                // 删除后重新获取卡密列表，确保数据同步
                await fetchCards();
            } catch (error) {
                alert('删除卡密失败: ' + (error.message || '未知错误'));
            }
        };

        const exportCards = async () => {
            try {
                const response = await api.get('/cards/export', { responseType: 'blob' });
                
                // 创建下载链接
                const url = window.URL.createObjectURL(new Blob([response.data]));
                const link = document.createElement('a');
                link.href = url;
                link.setAttribute('download', `卡密列表_${new Date().toISOString().slice(0, 10)}.csv`);
                document.body.appendChild(link);
                
                // 触发下载并移除链接
                link.click();
                document.body.removeChild(link);
                window.URL.revokeObjectURL(url);
            } catch (error) {
                alert('导出卡密失败');
            }
        };

        // User methods
        const fetchUsers = async () => {
            try {
                const response = await api.get('/users');
                users.value = response.data;
            } catch (error) {
                alert('获取用户列表失败');
            }
        };

        const editUser = (user) => {
            editingUser.value = user;
            userForm.value = {
                username: user.username,
                password: '',
                email: user.email || '',
                role: user.role
            };
            showCreateUserModal.value = true;
        };

        const closeUserModal = () => {
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
                    // 更新现有用户
                    const updateData = {
                        email: userForm.value.email,
                        role: userForm.value.role
                    };
                    if (userForm.value.password) {
                        updateData.password = userForm.value.password;
                    }
                    await api.put(`/users/${editingUser.value.id}`, updateData);
                    await fetchUsers(); // 重新获取用户列表
                } else {
                    // 创建新用户
                    await api.post('/users/register', userForm.value);
                    await fetchUsers(); // 重新获取用户列表
                }
                closeUserModal();
            } catch (error) {
                alert(editingUser.value ? '更新用户失败' : '创建用户失败');
            }
        };

        const deleteUser = async (user) => {
            if (user.username === currentUser.value.username) {
                alert('不能删除当前登录的用户');
                return;
            }

            if (!confirm(`确定要删除用户 ${user.username} 吗？`)) {
                return;
            }

            try {
                await api.delete(`/users/${user.id}`);
                await fetchUsers(); // 重新获取用户列表
            } catch (error) {
                alert('删除用户失败');
            }
        };

        // Utility methods
        const formatDate = (dateStr) => {
            if (!dateStr) return '-';
            const date = new Date(dateStr);
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
                const response = await api.get('/users/me');
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
        watch(currentView, (newView) => {
            logger.log('Current view changed to:', newView);
            if (newView === 'users' && currentUser.value?.role === 'ADMIN') {
                logger.log('Fetching users after view change...');
                fetchUsers();
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
            cardSearchQuery,
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