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
                console.log('Login response:', response.data);
                token.value = response.data.token;
                currentUser.value = response.data.user;
                console.log('Current user after login:', currentUser.value);
                localStorage.setItem('token', token.value);
                localStorage.setItem('user', JSON.stringify(currentUser.value));
                loginForm.value = { username: '', password: '' };
                
                // 登录成功后加载数据
                await fetchCards();
                console.log('Current user role:', currentUser.value.role);
                if (currentUser.value.role === 'ADMIN') {
                    console.log('Fetching users for admin...');
                    await fetchUsers();
                }
            } catch (error) {
                console.error('Login failed:', error);
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
                console.error('Error fetching cards:', error);
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
                    
                    console.log('Generated card response:', response.data);
                    
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
                    
                    console.log('Processed new card:', newCard);
                    cards.value.unshift(newCard);
                }
                showGenerateCardModal.value = false;
                cardForm.value = { duration_days: 30, count: 1 };
                
                // 生成完成后重新获取卡密列表
                await fetchCards();
            } catch (error) {
                console.error('Error generating card:', error);
                alert('生成卡密失败');
            }
        };

        const deleteCard = async (card) => {
            if (!confirm(`确定要删除卡号为 ${card.card_number} 的卡密吗？`)) {
                return;
            }

            try {
                console.log('Deleting card:', card);
                
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

                console.log('Deleting card with ID:', cardId);
                
                await api.delete(`/cards/${cardId}`);
                
                // 删除后重新获取卡密列表，确保数据同步
                await fetchCards();
            } catch (error) {
                console.error('Error deleting card:', error);
                console.error('Card data:', card);
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
                console.error('Error exporting cards:', error);
                alert('导出卡密失败');
            }
        };

        // User methods
        const fetchUsers = async () => {
            console.log('Fetching users...');
            try {
                const response = await api.get('/users');
                console.log('Users response:', response.data);
                users.value = response.data;
            } catch (error) {
                console.error('Failed to fetch users:', error);
                alert('获取用户列表失败');
            }
        };

        const editUser = (user) => {
            console.log('Editing user:', user);
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
                console.error('Failed to save user:', error);
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
                console.error('Failed to delete user:', error);
                alert('删除用户失败');
            }
        };

        // Utility methods
        const formatDate = (dateStr) => {
            if (!dateStr) return '-';
            const date = new Date(dateStr);
            return date.toLocaleString();
        };

        // Initialize
        onMounted(async () => {
            console.log('Component mounted');
            console.log('isLoggedIn:', isLoggedIn.value);
            console.log('currentUser:', currentUser.value);
            
            if (isLoggedIn.value) {
                await fetchCards();
                if (currentUser.value?.role === 'ADMIN') {
                    console.log('Fetching users on mount...');
                    await fetchUsers();
                }
            }
        });

        // 添加一个 watch 来监视 currentView 的变化
        watch(currentView, (newView) => {
            console.log('Current view changed to:', newView);
            if (newView === 'users' && currentUser.value?.role === 'ADMIN') {
                console.log('Fetching users after view change...');
                fetchUsers();
            }
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

// 添加全局错误处理
app.config.errorHandler = (err, vm, info) => {
    console.error('Vue error:', err);
    console.error('Error info:', info);
}; 