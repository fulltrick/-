class SimpleFaceApp {
    constructor() {
        this.currentImage = null;
        this.init();
    }

    init() {
        this.setupEventListeners();
        this.loadSavedFaces();
        this.showSuccessMessage('アプリの準備が完了しました！写真をアップロードしてください。');
    }

    setupEventListeners() {
        // タブ切り替え
        document.getElementById('upload-tab').addEventListener('click', () => this.showTab('upload'));
        document.getElementById('list-tab').addEventListener('click', () => this.showTab('list'));

        // ファイル選択
        document.getElementById('file-button').addEventListener('click', () => {
            document.getElementById('file-input').click();
        });
        document.getElementById('file-input').addEventListener('change', (e) => this.handleFileSelect(e));

        // カメラ撮影
        document.getElementById('camera-button').addEventListener('click', () => this.startCamera());
        document.getElementById('capture-button').addEventListener('click', () => this.capturePhoto());
        document.getElementById('cancel-button').addEventListener('click', () => this.stopCamera());

        // 顔検出（実際は手動保存）
        document.getElementById('detect-faces-button').addEventListener('click', () => this.prepareForSaving());

        // 保存
        document.getElementById('save-all-button').addEventListener('click', () => this.saveAllFaces());

        // 全削除
        document.getElementById('clear-all-button').addEventListener('click', () => this.clearAllData());
    }

    showTab(tab) {
        // タブボタンの状態を更新
        document.querySelectorAll('.tab-button').forEach(btn => btn.classList.remove('active'));
        document.getElementById(`${tab}-tab`).classList.add('active');

        // セクションの表示を更新
        document.querySelectorAll('.section').forEach(section => section.classList.remove('active'));
        document.getElementById(`${tab}-section`).classList.add('active');

        if (tab === 'list') {
            this.loadSavedFaces();
        }
    }

    handleFileSelect(event) {
        const file = event.target.files[0];
        if (file) {
            this.loadImage(file);
        }
    }

    loadImage(file) {
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = document.getElementById('uploaded-image');
            img.src = e.target.result;
            img.onload = () => {
                this.currentImage = img;
                this.showImageArea();
                this.hideAreasAfterImage();
                this.showSuccessMessage('画像が読み込まれました！「顔を保存準備」ボタンをクリックしてください。');
            };
        };
        reader.readAsDataURL(file);
    }

    async startCamera() {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ 
                video: { 
                    facingMode: 'environment',
                    width: { ideal: 1280 },
                    height: { ideal: 720 }
                } 
            });
            
            const video = document.getElementById('video');
            video.srcObject = stream;
            video.style.display = 'block';
            document.getElementById('capture-controls').style.display = 'block';
            document.getElementById('camera-button').style.display = 'none';
            document.getElementById('file-button').style.display = 'none';
        } catch (error) {
            console.error('カメラのアクセスに失敗しました:', error);
            this.showErrorMessage('カメラにアクセスできませんでした。ファイル選択をご利用ください。');
        }
    }

    capturePhoto() {
        const video = document.getElementById('video');
        const canvas = document.getElementById('canvas');
        const context = canvas.getContext('2d');

        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        context.drawImage(video, 0, 0);

        const imageData = canvas.toDataURL('image/jpeg');
        const img = document.getElementById('uploaded-image');
        img.src = imageData;
        img.onload = () => {
            this.currentImage = img;
            this.showImageArea();
            this.hideAreasAfterImage();
            this.stopCamera();
            this.showSuccessMessage('写真を撮影しました！「顔を保存準備」ボタンをクリックしてください。');
        };
    }

    stopCamera() {
        const video = document.getElementById('video');
        if (video.srcObject) {
            const tracks = video.srcObject.getTracks();
            tracks.forEach(track => track.stop());
            video.srcObject = null;
        }
        video.style.display = 'none';
        document.getElementById('capture-controls').style.display = 'none';
        document.getElementById('camera-button').style.display = 'inline-block';
        document.getElementById('file-button').style.display = 'inline-block';
    }

    showImageArea() {
        document.getElementById('image-area').style.display = 'block';
        // ボタンテキストを変更
        document.getElementById('detect-faces-button').textContent = '顔を保存準備';
    }

    hideAreasAfterImage() {
        document.getElementById('faces-area').style.display = 'none';
        document.getElementById('faces-container').innerHTML = '';
        document.getElementById('save-all-button').style.display = 'none';
    }

    prepareForSaving() {
        if (!this.currentImage) {
            this.showErrorMessage('画像が選択されていません。');
            return;
        }

        // 画像全体を保存用に準備
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        
        // 画像サイズを適切に調整
        const maxSize = 300;
        let { width, height } = this.currentImage;
        
        if (width > height) {
            if (width > maxSize) {
                height = (height * maxSize) / width;
                width = maxSize;
            }
        } else {
            if (height > maxSize) {
                width = (width * maxSize) / height;
                height = maxSize;
            }
        }
        
        canvas.width = width;
        canvas.height = height;
        ctx.drawImage(this.currentImage, 0, 0, width, height);
        
        const faceItem = this.createFaceItem(canvas, 0);
        const container = document.getElementById('faces-container');
        container.innerHTML = '';
        container.appendChild(faceItem);
        
        document.getElementById('faces-area').style.display = 'block';
        document.getElementById('save-all-button').style.display = 'block';
        
        this.showSuccessMessage('保存の準備ができました！名前を入力して保存してください。');
    }

    createFaceItem(faceCanvas, index) {
        const faceItem = document.createElement('div');
        faceItem.className = 'face-item';
        
        const img = document.createElement('img');
        img.className = 'face-image';
        img.src = faceCanvas.toDataURL('image/jpeg', 0.8);
        
        const nameInput = document.createElement('input');
        nameInput.type = 'text';
        nameInput.className = 'name-input';
        nameInput.placeholder = '名前を入力してください';
        
        const saveButton = document.createElement('button');
        saveButton.className = 'save-face-button';
        saveButton.textContent = '保存';
        saveButton.onclick = () => this.saveSingleFace(index, nameInput.value, img.src);
        
        faceItem.appendChild(img);
        faceItem.appendChild(nameInput);
        faceItem.appendChild(saveButton);
        
        return faceItem;
    }

    saveSingleFace(index, name, imageData) {
        if (!name.trim()) {
            this.showErrorMessage('名前を入力してください。');
            return;
        }

        const savedFaces = this.getSavedFaces();
        const faceData = {
            id: Date.now() + '_' + index + '_' + Math.random(),
            name: name.trim(),
            image: imageData,
            timestamp: new Date().toISOString()
        };
        
        savedFaces.push(faceData);
        localStorage.setItem('savedFaces', JSON.stringify(savedFaces));
        
        this.showSuccessMessage(`${name}さんの顔を保存しました！`);
        this.loadSavedFaces();
    }

    saveAllFaces() {
        const nameInputs = document.querySelectorAll('.name-input');
        const faces = document.querySelectorAll('.face-image');
        
        let savedCount = 0;
        nameInputs.forEach((input, index) => {
            const name = input.value.trim();
            if (name) {
                const imageData = faces[index].src;
                const savedFaces = this.getSavedFaces();
                const faceData = {
                    id: Date.now() + '_' + index + '_' + Math.random(),
                    name: name.trim(),
                    image: imageData,
                    timestamp: new Date().toISOString()
                };
                
                savedFaces.push(faceData);
                localStorage.setItem('savedFaces', JSON.stringify(savedFaces));
                savedCount++;
            }
        });
        
        if (savedCount === 0) {
            this.showErrorMessage('保存する顔がありません。名前を入力してください。');
        } else {
            this.showSuccessMessage(`${savedCount}人の顔を保存しました！`);
            this.loadSavedFaces();
        }
    }

    getSavedFaces() {
        const saved = localStorage.getItem('savedFaces');
        return saved ? JSON.parse(saved) : [];
    }

    loadSavedFaces() {
        const savedFaces = this.getSavedFaces();
        const container = document.getElementById('saved-faces-container');
        const noDataMessage = document.getElementById('no-data-message');
        const clearButton = document.getElementById('clear-all-button');
        
        container.innerHTML = '';
        
        if (savedFaces.length === 0) {
            container.appendChild(noDataMessage);
            clearButton.style.display = 'none';
        } else {
            clearButton.style.display = 'block';
            savedFaces.forEach(face => {
                const faceItem = this.createSavedFaceItem(face);
                container.appendChild(faceItem);
            });
        }
    }

    createSavedFaceItem(faceData) {
        const faceItem = document.createElement('div');
        faceItem.className = 'saved-face-item';
        
        const img = document.createElement('img');
        img.className = 'saved-face-image';
        img.src = faceData.image;
        
        const name = document.createElement('div');
        name.className = 'saved-face-name';
        name.textContent = faceData.name;
        
        const deleteButton = document.createElement('button');
        deleteButton.className = 'delete-face-button';
        deleteButton.textContent = '削除';
        deleteButton.onclick = () => this.deleteFace(faceData.id);
        
        faceItem.appendChild(img);
        faceItem.appendChild(name);
        faceItem.appendChild(deleteButton);
        
        return faceItem;
    }

    deleteFace(faceId) {
        if (confirm('この顔データを削除しますか？')) {
            const savedFaces = this.getSavedFaces();
            const filteredFaces = savedFaces.filter(face => face.id !== faceId);
            localStorage.setItem('savedFaces', JSON.stringify(filteredFaces));
            this.loadSavedFaces();
            this.showSuccessMessage('データを削除しました。');
        }
    }

    clearAllData() {
        if (confirm('すべての保存されたデータを削除しますか？この操作は元に戻せません。')) {
            localStorage.removeItem('savedFaces');
            this.loadSavedFaces();
            this.showSuccessMessage('すべてのデータを削除しました。');
        }
    }

    // メッセージ表示機能
    showSuccessMessage(message) {
        this.removeExistingMessages();
        const messageDiv = document.createElement('div');
        messageDiv.className = 'message success-message';
        messageDiv.textContent = message;
        document.querySelector('.container').insertBefore(messageDiv, document.querySelector('main'));
        
        // 3秒後に自動削除
        setTimeout(() => {
            if (messageDiv.parentNode) {
                messageDiv.parentNode.removeChild(messageDiv);
            }
        }, 3000);
    }

    showErrorMessage(message) {
        this.removeExistingMessages();
        const messageDiv = document.createElement('div');
        messageDiv.className = 'message error-message';
        messageDiv.textContent = message;
        document.querySelector('.container').insertBefore(messageDiv, document.querySelector('main'));
        
        // 5秒後に自動削除
        setTimeout(() => {
            if (messageDiv.parentNode) {
                messageDiv.parentNode.removeChild(messageDiv);
            }
        }, 5000);
    }

    removeExistingMessages() {
        const messages = document.querySelectorAll('.message');
        messages.forEach(message => {
            if (message.parentNode) {
                message.parentNode.removeChild(message);
            }
        });
    }
}

// アプリケーションを初期化
document.addEventListener('DOMContentLoaded', () => {
    new SimpleFaceApp();
});