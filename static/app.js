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
        const displayedCards = ref([]); // 新增：用于显示的卡密列表
        const showGenerateCardModal = ref(false);
        const cardForm = ref({
            duration_days: 30,
            count: 1
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
        
        // 监听搜索查询变化，实时过滤卡密列表
        watch(cardSearchQuery, (newQuery) => {
            searchCards();
        });
        
        // 监听卡密列表变化，更新显示的卡密
        watch(cards, (newCards) => {
            searchCards();
        });
        
        // 登录函数
        const login = async () => {
            try {
                loginError.value = '';
                logger.info('Attempting to login with username:', loginForm.value.username);
                
                // 修改登录请求的 URL 路径
                const response = await axios.post('/api/users/login', loginForm.value);
                
                token.value = response.data.token;
                currentUser.value = response.data.user;
                localStorage.setItem('token', token.value);
                localStorage.setItem('user', JSON.stringify(currentUser.value));
                
                // 设置 axios 默认请求头
                axios.defaults.headers.common['Authorization'] = `Bearer ${token.value}`;
                
                // 加载初始数据
                if (currentUser.value.role === 'ADMIN') {
                    fetchUsers();
                }
                fetchCards();
                
                logger.info('Login successful for user:', currentUser.value.username);
            } catch (error) {
                logger.error('Login error:', error);
                if (error.response && error.response.data) {
                    loginError.value = error.response.data;
                } else {
                    loginError.value = '登录失败，请检查网络连接';
                }
            }
        };
        
        // 注销函数
        const logout = () => {
            token.value = '';
            currentUser.value = null;
            localStorage.removeItem('token');
            localStorage.removeItem('user');
            delete axios.defaults.headers.common['Authorization'];
        };
        
        // 切换视图
        const switchView = (view) => {
            currentView.value = view;
        };
        
        // 格式化日期
        const formatDate = (dateStr) => {
            if (!dateStr) return '-';
            try {
                const date = new Date(dateStr);
                return date.toLocaleString('zh-CN');
            } catch (e) {
                return dateStr;
            }
        };
        
        // 获取所有卡密
        const fetchCards = async () => {
            try {
                const response = await axios.get('/api/cards');
                cards.value = response.data;
                logger.info('Fetched cards:', cards.value);
            } catch (error) {
                logger.error('Error fetching cards:', error);
                if (error.response && error.response.status === 401) {
                    logout();
                }
            }
        };
        
        // 搜索卡密
        const searchCards = () => {
            const query = cardSearchQuery.value.toLowerCase();
            if (!query) {
                displayedCards.value = cards.value;
                return;
            }
            
            displayedCards.value = cards.value.filter(card => {
                return card.card_number.toLowerCase().includes(query) ||
                       (card.created_by_username && card.created_by_username.toLowerCase().includes(query));
            });
        };
        
        // 生成卡密
        const generateCard = async () => {
            try {
                const response = await axios.post('/api/cards/generate', cardForm.value);
                logger.info('Generated cards:', response.data);
                await fetchCards();
                showGenerateCardModal.value = false;
                // 重置表单
                cardForm.value = {
                    duration_days: 30,
                    count: 1
                };
            } catch (error) {
                logger.error('Error generating card:', error);
                if (error.response && error.response.status === 401) {
                    logout();
                }
            }
        };
        
        // 添加一个辅助函数来获取卡密的ID
        const getCardId = (card) => {
            if (!card) return null;
            
            // 检查各种可能的ID格式
            if (card._id) {
                // 如果 _id 是对象（MongoDB BSON 格式）
                if (typeof card._id === 'object' && card._id.$oid) {
                    return card._id.$oid;
                }
                return card._id;
            } else if (card.id) {
                return card.id;
            }
            
            return null;
        };
        
        // 修改删除卡密函数
        const deleteCard = async (card) => {
            if (!confirm('确定要删除这个卡密吗？')) return;
            
            try {
                // 获取卡密ID
                const cardId = getCardId(card);
                
                if (!cardId) {
                    logger.error('Cannot extract ID from card:', card);
                    alert('删除失败：无法获取卡密ID');
                    return;
                }
                
                logger.info('Attempting to delete card with ID:', cardId);
                
                await axios.delete(`/api/cards/${cardId}`);
                logger.info('Deleted card successfully');
                await fetchCards();
            } catch (error) {
                logger.error('Error deleting card:', error);
                if (error.response && error.response.status === 401) {
                    logout();
                } else {
                    alert('删除卡密失败: ' + (error.response?.data || error.message));
                }
            }
        };
        
        // 修复导出卡密功能 - 方法二：使用 Blob 和 URL.createObjectURL
        const exportCards = async () => {
            try {
                logger.info('Exporting cards...');
                
                // 直接使用 axios 发送请求，它会自动带上认证头
                const response = await axios.get('/api/cards/export', {
                    responseType: 'blob' // 指定响应类型为 blob
                });
                
                // 创建 Blob URL
                const blob = new Blob([response.data], { type: 'text/csv' });
                const url = window.URL.createObjectURL(blob);
                
                // 创建临时链接并点击下载
                const link = document.createElement('a');
                link.href = url;
                link.setAttribute('download', 'cards.csv');
                document.body.appendChild(link);
                link.click();
                
                // 清理
                window.URL.revokeObjectURL(url);
                document.body.removeChild(link);
                
                logger.info('Cards exported successfully');
            } catch (error) {
                logger.error('Error exporting cards:', error);
                alert('导出卡密失败: ' + (error.response?.data || error.message || '未知错误'));
            }
        };
        
        // 获取所有用户
        const fetchUsers = async () => {
            try {
                const response = await axios.get('/api/users');
                users.value = response.data;
                logger.info('Fetched users:', users.value);
            } catch (error) {
                logger.error('Error fetching users:', error);
                if (error.response && error.response.status === 401) {
                    logout();
                }
            }
        };
        
        // 编辑用户
        const editUser = (user) => {
            editingUser.value = user;
            userForm.value = {
                username: user.username,
                password: '', // 不回显密码
                email: user.email || '',
                role: user.role
            };
            showCreateUserModal.value = true;
        };
        
        // 关闭用户模态框
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
        
        // 保存用户
        const saveUser = async () => {
            try {
                if (editingUser.value) {
                    // 更新用户
                    const payload = { ...userForm.value };
                    if (!payload.password) delete payload.password; // 如果密码为空，不更新密码
                    
                    await axios.put(`/api/users/${editingUser.value.id}`, payload);
                    logger.info('Updated user:', editingUser.value.id);
                } else {
                    // 创建新用户
                    await axios.post('/api/users', userForm.value);
                    logger.info('Created new user');
                }
                
                await fetchUsers();
                closeUserModal();
            } catch (error) {
                logger.error('Error saving user:', error);
                if (error.response && error.response.status === 401) {
                    logout();
                }
                alert('保存用户失败: ' + (error.response?.data || error.message));
            }
        };
        
        // 删除用户
        const deleteUser = async (userId) => {
            if (!confirm('确定要删除这个用户吗？')) return;
            
            try {
                await axios.delete(`/api/users/${userId}`);
                logger.info('Deleted user:', userId);
                await fetchUsers();
            } catch (error) {
                logger.error('Error deleting user:', error);
                if (error.response && error.response.status === 401) {
                    logout();
                }
                alert('删除用户失败: ' + (error.response?.data || error.message));
            }
        };
        
        // 初始化
        onMounted(() => {
            // 如果已登录，设置 axios 默认请求头并加载数据
            if (token.value) {
                axios.defaults.headers.common['Authorization'] = `Bearer ${token.value}`;
                fetchCards();
                if (currentUser.value && currentUser.value.role === 'ADMIN') {
                    fetchUsers();
                }
            }
        });
        
        return {
            // Auth
            token,
            currentUser,
            isLoggedIn,
            loginForm,
            loginError,
            login,
            logout,
            
            // View
            currentView,
            switchView,
            
            // Cards
            cards,
            displayedCards,
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