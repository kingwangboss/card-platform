const { createApp, ref, onMounted, computed } = Vue;

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
        const userForm = ref({ username: '', password: '', email: '', role: 'User' });

        // API client setup
        const api = axios.create({
            baseURL: '/api',
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
                token.value = response.data.token;
                currentUser.value = response.data.user;
                localStorage.setItem('token', token.value);
                localStorage.setItem('user', JSON.stringify(currentUser.value));
                loginForm.value = { username: '', password: '' };
                fetchCards();
                if (currentUser.value.role === 'Admin') {
                    fetchUsers();
                }
            } catch (error) {
                console.error('Login error:', error);
                loginError.value = error.response?.data || '登录失败，请检查用户名和密码';
            }
        };

        const logout = () => {
            token.value = '';
            currentUser.value = null;
            localStorage.removeItem('token');
            localStorage.removeItem('user');
            currentView.value = 'cards';
        };

        // Card methods
        const fetchCards = async () => {
            try {
                const response = await api.get('/cards');
                cards.value = response.data;
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
                    cards.value.unshift(response.data);
                }
                showGenerateCardModal.value = false;
                cardForm.value = { duration_days: 30, count: 1 };
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
                const cardId = card._id?.$oid;
                
                if (!cardId) {
                    throw new Error('Card ID not found');
                }

                await api.delete(`/cards/${cardId}`);
                cards.value = cards.value.filter(c => c._id.$oid !== cardId);
            } catch (error) {
                alert('删除卡密失败: ' + (error.response?.data || error.message));
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
            try {
                const response = await api.get('/users');
                users.value = response.data;
            } catch (error) {
                console.error('Error fetching users:', error);
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
            userForm.value = { username: '', password: '', email: '', role: 'User' };
        };

        const saveUser = async () => {
            try {
                if (editingUser.value) {
                    // Update existing user
                    const updateData = {
                        email: userForm.value.email,
                        role: userForm.value.role
                    };
                    if (userForm.value.password) {
                        updateData.password = userForm.value.password;
                    }
                    await api.put(`/users/${editingUser.value.id}`, updateData);
                    
                    // Update local data
                    const index = users.value.findIndex(u => u.id === editingUser.value.id);
                    if (index !== -1) {
                        users.value[index] = {
                            ...users.value[index],
                            ...updateData,
                            password: undefined
                        };
                    }
                } else {
                    // Create new user
                    const response = await api.post('/users/register', userForm.value);
                    users.value.push(response.data);
                }
                closeUserModal();
            } catch (error) {
                console.error('Error saving user:', error);
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
                users.value = users.value.filter(u => u.id !== user.id);
            } catch (error) {
                console.error('Error deleting user:', error);
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
        onMounted(() => {
            if (isLoggedIn.value) {
                fetchCards();
                if (currentUser.value.role === 'Admin') {
                    fetchUsers();
                }
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