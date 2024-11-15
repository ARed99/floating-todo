class TodoApp {
        constructor() {
                this.todos = [];
                this.isDragging = false;
                this.dragStartX = 0;
                this.dragStartY = 0;
                this.initialPosition = {
                        right: '20px',
                        top: '20px',
                };
                this.isMinimized = false;
                this.syncing = false;

                this.init();
                this.setupSyncListeners();
        }

        setupSyncListeners() {
                chrome.storage.onChanged.addListener((changes, namespace) => {
                        if (namespace === 'local') {
                                if (changes.todos) {
                                        this.todos = changes.todos.newValue || [];
                                        this.render();
                                }
                                if (changes.isMinimized) {
                                        this.isMinimized = changes.isMinimized.newValue;
                                        this.updateMinimizedState();
                                }
                                if (changes.position) {
                                        this.updatePosition(changes.position.newValue);
                                }
                        }
                });

                chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
                        if (message.type === 'SYNC_TODOS') {
                                this.todos = message.todos || [];
                                this.render();
                                sendResponse({ success: true });
                        }
                        return true;
                });
        }

        updateMinimizedState() {
                if (this.isMinimized) {
                        this.container.classList.add('minimized');
                } else {
                        this.container.classList.remove('minimized');
                }
        }

        updatePosition(position) {
                if (position && typeof position === 'object') {
                        Object.assign(this.container.style, position);
                }
        }

        async init() {
                try {
                        // Create the main container
                        this.container = document.createElement('div');
                        this.container.className = 'todo-container';
                        Object.assign(this.container.style, this.initialPosition);

                        // Create the header with logo and minimize button
                        const header = document.createElement('div');
                        header.className = 'todo-header';

                        // Create the header content using template literals
                        header.innerHTML = `
            <span class="drag-handle no-select">☰</span>
            <div class="logo-container no-select">
              <span class="logo-text" >Floating Todo</span>    
                <div class="minimize-btn">[ - ]</div> 
            </div>
          
        `;

                        // Create the footer
                        const footer = document.createElement('div');
                        footer.className = 'footer';
                        footer.innerHTML = `<a href="https://ared.dev" target="_blank">Made By Ared</a>`;

                        // Create the input field for adding new todos
                        this.input = document.createElement('input');
                        this.input.className = 'todo-input';
                        this.input.placeholder = 'Add a new todo...';

                        // Create the list container for todos
                        this.todoList = document.createElement('div');
                        this.todoList.className = 'todo-list';

                        // Append header, input, todoList, and footer to the main container
                        this.container.appendChild(header);
                        this.container.appendChild(this.input);
                        this.container.appendChild(this.todoList);
                        this.container.appendChild(footer);

                        // Add the container to the body of the document
                        document.body.appendChild(this.container);

                        // Load any previously saved state
                        await this.loadSavedState();

                        // Set up event listeners for input and other interactions
                        this.setupEventListeners();
                } catch (error) {
                        console.error('Error initializing TodoApp:', error);
                }
        }

        async loadSavedState() {
                const saved = await chrome.storage.local.get([
                        'todos',
                        'isMinimized',
                        'position',
                ]);
                this.todos = saved.todos || [];
                this.isMinimized = saved.isMinimized || false;
                if (saved.position) {
                        this.updatePosition(saved.position);
                }
                this.updateMinimizedState();
                this.render();
        }

        setupEventListeners() {
                this.input.addEventListener('keypress', (e) => {
                        if (e.key === 'Enter' && this.input.value.trim()) {
                                this.addTodo(this.input.value.trim());
                                this.input.value = '';
                        }
                });

                this.todoList.addEventListener('click', (e) => {
                        const todoItem = e.target.closest('.todo-item');
                        if (!todoItem) return;

                        const todoId = Number(todoItem.dataset.id);

                        if (e.target.matches('.delete-btn')) {
                                this.deleteTodo(todoId);
                        } else if (e.target.matches('input[type="checkbox"]')) {
                                this.toggleTodo(todoId);
                        } else if (e.target.matches('.edit-btn')) {
                                this.editTodoPrompt(todoId);
                        }
                });

                this.container
                        .querySelector('.minimize-btn')
                        .addEventListener('click', () => {
                                this.toggleMinimize();
                        });

                const dragHandle = this.container.querySelector('.drag-handle');
                dragHandle.addEventListener('mousedown', this.startDragging.bind(this));
                document.addEventListener('mousemove', this.drag.bind(this));
                document.addEventListener('mouseup', this.stopDragging.bind(this));
        }

        async toggleMinimize() {
                this.isMinimized = !this.isMinimized;
                this.updateMinimizedState();
                await this.saveState({ isMinimized: this.isMinimized });
                if (this.isMinimized) {
                        document.querySelector('.minimize-btn').textContent = '[ + ]';
                } else {
                        document.querySelector('.minimize-btn').textContent = '[ - ]';
                }
        }

        startDragging(e) {
                e.preventDefault();
                this.isDragging = true;
                const rect = this.container.getBoundingClientRect();
                this.dragStartX = e.clientX - rect.left;
                this.dragStartY = e.clientY - rect.top;
                this.container.classList.add('dragging');
        }

        drag(e) {
                if (!this.isDragging) return;
                const newX = e.clientX - this.dragStartX;
                const newY = e.clientY - this.dragStartY;
                const maxX = window.innerWidth - this.container.offsetWidth;
                const maxY = window.innerHeight - this.container.offsetHeight;
                const boundedX = Math.max(0, Math.min(newX, maxX));
                const boundedY = Math.max(0, Math.min(newY, maxY));
                this.container.style.left = `${boundedX}px`;
                this.container.style.top = `${boundedY}px`;
                this.container.style.right = 'auto';
        }

        async stopDragging() {
                if (!this.isDragging) return;
                this.isDragging = false;
                this.container.classList.remove('dragging');
                const position = {
                        left: this.container.style.left,
                        top: this.container.style.top,
                        right: 'auto',
                };
                await this.saveState({ position });
        }

        async addTodo(text) {
                this.todos.push({ id: Date.now(), text, completed: false });
                await this.saveAndSync();
        }

        async toggleTodo(id) {
                this.todos = this.todos.map((todo) =>
                        todo.id === id ? { ...todo, completed: !todo.completed } : todo,
                );
                await this.saveAndSync();
        }

        async deleteTodo(id) {
                this.todos = this.todos.filter((todo) => todo.id !== id);
                await this.saveAndSync();
        }

        async editTodoPrompt(id) {
                const todo = this.todos.find((todo) => todo.id === id);
                if (!todo) return;
                const newText = prompt('Edit your todo:', todo.text);
                if (newText && newText.trim() !== '') {
                        this.editTodo(id, newText.trim());
                }
        }

        async editTodo(id, newText) {
                this.todos = this.todos.map((todo) =>
                        todo.id === id ? { ...todo, text: newText } : todo,
                );
                await this.saveAndSync();
        }

        async saveState(state) {
                try {
                        await chrome.storage.local.set(state);
                } catch (error) {
                        console.error('Error saving state:', error);
                }
        }

        async saveAndSync() {
                this.syncing = true;
                try {
                        await this.saveState({ todos: this.todos });
                        await this.broadcastUpdate();
                        this.render();
                } catch (error) {
                        console.error('Error saving and syncing:', error);
                } finally {
                        this.syncing = false;
                }
        }

        async broadcastUpdate() {
                try {
                        await chrome.runtime.sendMessage({
                                type: 'UPDATE_TODOS',
                                todos: this.todos,
                        });
                } catch (error) {
                        console.error('Error broadcasting update:', error);
                }
        }
        isValidUrl(text) {
                try {
                        const url = new URL(text);
                        return url.protocol === 'http:' || url.protocol === 'https:';
                } catch (_) {
                        return false;
                }
        }

        applyShortCut(shortCut, text) {
                switch (shortCut) {
                        case '>time':
                                return text.replace(
                                        shortCut,
                                        new Date().toLocaleTimeString(),
                                );
                }
                this.render();
        }

        cutTextToMaxWords(text, wordLimit = 50) {
                const words = text.trim().split(/\s+/);

                if (words.length > wordLimit) {
                        return words.slice(0, wordLimit).join(' ') + '...'; // Adding "..." to indicate truncation
                }
                console.log('trimmed text : ' + text);
                return text;
        }

        render() {
                try {
                        this.todoList.innerHTML = this.todos
                                .map((todo) => {
                                        let todoText = this.applyShortCut(
                                                '>time',
                                                todo.text,
                                        );
                                        todoText = this.cutTextToMaxWords(todoText); // cut words to 200 rate limit
                                        todoText = this.isValidUrl(todoText)
                                                ? `<a href="${todoText}" target="_blank" rel="noopener noreferrer">${this.escapeHtml(
                                                          todoText,
                                                  )}</a>`
                                                : this.escapeHtml(todoText);

                                        return `
                    <div class="todo-item ${
                            todo.completed ? 'completed' : ''
                    }" data-id="${todo.id}">
                        <input type="checkbox" ${todo.completed ? 'checked' : ''}>
                        <span class="todo-text">${todoText}</span>
                        <button class="delete-btn">×</button>
                    </div>
                `;
                                })
                                .join('');

                        this.todoList.querySelectorAll('.todo-text').forEach((span) => {
                                span.addEventListener('dblclick', (e) => {
                                        const textElementHeight = `${span.clientHeight}px`;
                                        const todoItem = e.target.closest('.todo-item');
                                        const todoId = Number(todoItem.dataset.id);
                                        const todo = this.todos.find(
                                                (t) => t.id === todoId,
                                        );

                                        if (!todo) return;
                                        let todoText = this.applyShortCut(
                                                '>time',
                                                todo.text,
                                        );
                                        todoText = this.cutTextToMaxWords(todoText);

                                        const input = document.createElement('textarea');
                                        input.value = todoText; // Set the text area value properly
                                        input.className = 'edit-input';

                                        // Set textarea height to match span height before replacing
                                        input.style.height = `${span.clientHeight}px`; // Match span height

                                        // Fade out the span and replace it with the input
                                        span.style.opacity = '0'; // Fade out the span
                                        input.style.height = `${span.clientHeight}px`; // Set the span height to prevent shrinking

                                        setTimeout(() => {
                                                span.replaceWith(input);
                                                input.focus();

                                                // Fade in the textarea after replacing
                                                input.style.opacity = '1';
                                                input.style.height = textElementHeight;

                                                // Save changes on blur or Enter key press
                                                const saveChanges = async () => {
                                                        const newText =
                                                                input.value.trim();
                                                        if (
                                                                newText !== '' &&
                                                                newText !== todo.text
                                                        ) {
                                                                this.editTodo(
                                                                        todoId,
                                                                        newText,
                                                                );
                                                        }
                                                        // Restore the span after editing
                                                        input.replaceWith(span);
                                                        span.textContent =
                                                                newText || todo.text; // Update text in UI
                                                        span.style.opacity = '1'; // Make the span visible again
                                                };

                                                // Save changes on blur or Enter key press
                                                input.addEventListener(
                                                        'blur',
                                                        saveChanges,
                                                );
                                                input.addEventListener(
                                                        'keypress',
                                                        (event) => {
                                                                if (
                                                                        event.key ===
                                                                        'Enter'
                                                                ) {
                                                                        saveChanges();
                                                                }
                                                        },
                                                );
                                        }, 200); // Delay to allow the opacity transition to take effect
                                });
                        });
                } catch (error) {
                        console.error('Error rendering todos:', error);
                }
        }

        escapeHtml(str) {
                const div = document.createElement('div');
                div.textContent = str;
                return div.innerHTML;
        }
}

// Initialize the app when the DOM is ready
if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => new TodoApp());
} else {
        new TodoApp();
}
