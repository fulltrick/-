class FaceRecognitionApp {
    constructor() {
        this.modelsLoaded = false;
        this.currentImage = null;
        this.detectedFaces = [];
        this.init();
    }

    async init() {
        this.setupEventListeners();
        await this.loadModels();
        this.loadSavedFaces();
    }

    async loadModels() {
        try {
            console.log('モデルをロード中...');
            
            // ローディング表示を追加
            this.showLoadingMessage('顔認識モデルを読み込んでいます...');
            
            // CDNから直接読み込み
            const MODEL_URL = 'https://cdn.jsdelivr.net/npm/face-api.js@0.22.2/weights';
            
            // 必要最小限のモデルのみ読み込み
            await faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL);
            console.log('TinyFaceDetector loaded');
            
            await faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL);
            console.log('FaceLandmark68Net loaded');
            
            this.modelsLoaded = true;
            this.hideLoadingMessage();
            console.log('モデルのロードが完了しました');
            
            // 成功メッセージを表示
            this.showSuccessMessage('顔認識機能の準備が完了しました');
            
        } catch (error) {
            console.error('モデルのロードに失敗しました:', error);
            this.hideLoadingMessage();
            
            // より詳細なエラー情報を表示
            let errorMessage = '顔認識機能の初期化に失敗しました。';
            if (error.message.includes('Failed to fetch')) {
                errorMessage += ' インターネット接続を確認してください。';
            } else if (error.message.includes('404')) {
                errorMessage += ' モデルファイルが見つかりません。';
            } else {
                errorMessage += ` エラー: ${error.message}`;
            }
            
            this.showErrorMessage(errorMessage);
            
            // 簡易的な顔検出機能の提供
            this.offerManualMode();
        }
    }

    offerManualMode() {
        const manualModeDiv = document.createElement('div');
        manualModeDiv.className = 'manual-mode-notice';
        manualModeDiv.innerHTML = `
            <p>顔認識機能が利用できませんが、手動で顔を切り取って保存することができます。</p>
            <button id="manual-mode-button" class="manual-mode-btn">手動モードを使用</button>
        `;
        
        document.querySelector('#image-area').appendChild(manualModeDiv);
        
        document.getElementById('manual-mode-button').addEventListener('click', () => {
            this.enableManualMode();
        });
    }

    enableManualMode() {
        // 手動モードの実装
        this.showSuccessMessage('手動モードが有効になりました。画像を選択して手動で顔を保存できます。');
        
        // 顔検出ボタンを手動保存ボタンに変更
        const detectButton = document.getElementById('detect-faces-button');
        detectButton.textContent = '手動で保存';
        detectButton.onclick = () => this.manualSave();
    }

    manualSave() {
        if (!this.currentImage) {
            this.showErrorMessage('画像が選択されていません。');
            return;
        }

        // 画像全体を顔として扱う
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        
        canvas.width = this.currentImage.width;
        canvas.height = this.currentImage.height;
        ctx.drawImage(this.currentImage, 0, 0);
        
        const faceItem = this.createFaceItem(canvas, 0);
        const container = document.getElementById('faces-container');
        container.innerHTML = '';
        container.appendChild(faceItem);
        
        document.getElementById('faces-area').style.display = 'block';
        document.getElementById('save-all-button').style.display = 'block';
        
        this.showSuccessMessage('画像を保存用に準備しました。名前を入力して保存してください。');
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

        // 顔検出
        document.getElementById('detect-faces-button').addEventListener('click', () => this.detectFaces());

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
            alert('カメラにアクセスできませんでした。ファイル選択をご利用ください。');
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
    }

    hideAreasAfterImage() {
        document.getElementById('faces-area').style.display = 'none';
        document.getElementById('faces-container').innerHTML = '';
        document.getElementById('save-all-button').style.display = 'none';
    }

    async detectFaces() {
        if (!this.modelsLoaded) {
            this.showErrorMessage('顔認識機能がまだ読み込まれていません。しばらくお待ちください。');
            return;
        }

        if (!this.currentImage) {
            this.showErrorMessage('画像が選択されていません。');
            return;
        }

        try {
            document.getElementById('detect-faces-button').textContent = '検出中...';
            document.getElementById('detect-faces-button').disabled = true;

            // より確実な顔検出方法
            const detections = await faceapi.detectAllFaces(
                this.currentImage, 
                new faceapi.TinyFaceDetectorOptions({
                    inputSize: 416,
                    scoreThreshold: 0.5
                })
            ).withFaceLandmarks();

            if (detections.length === 0) {
                this.showErrorMessage('顔が検出されませんでした。他の画像をお試しください。');
            } else {
                this.detectedFaces = detections;
                this.displayDetectedFaces();
                document.getElementById('faces-area').style.display = 'block';
                document.getElementById('save-all-button').style.display = 'block';
                this.showSuccessMessage(`${detections.length}個の顔を検出しました！`);
            }
        } catch (error) {
            console.error('顔検出エラー:', error);
            this.showErrorMessage('顔検出中にエラーが発生しました: ' + error.message);
        } finally {
            document.getElementById('detect-faces-button').textContent = '顔を検出';
            document.getElementById('detect-faces-button').disabled = false;
        }
    }

    displayDetectedFaces() {
        const container = document.getElementById('faces-container');
        container.innerHTML = '';

        this.detectedFaces.forEach((detection, index) => {
            const faceCanvas = this.extractFace(detection.detection.box);
            const faceItem = this.createFaceItem(faceCanvas, index);
            container.appendChild(faceItem);
        });
    }

    extractFace(box) {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        
        const padding = 20;
        const x = Math.max(0, box.x - padding);
        const y = Math.max(0, box.y - padding);
        const width = Math.min(this.currentImage.width - x, box.width + padding * 2);
        const height = Math.min(this.currentImage.height - y, box.height + padding * 2);
        
        canvas.width = width;
        canvas.height = height;
        
        ctx.drawImage(this.currentImage, x, y, width, height, 0, 0, width, height);
        
        return canvas;
    }

    createFaceItem(faceCanvas, index) {
        const faceItem = document.createElement('div');
        faceItem.className = 'face-item';
        
        const img = document.createElement('img');
        img.className = 'face-image';
        img.src = faceCanvas.toDataURL();
        
        const nameInput = document.createElement('input');
        nameInput.type = 'text';
        nameInput.className = 'name-input';
        nameInput.placeholder = '名前を入力してください';
        
        const saveButton = document.createElement('button');
        saveButton.className = 'save-face-button';
        saveButton.textContent = '保存';
        saveButton.onclick = () => this.saveSingleFace(index, nameInput.value, faceCanvas.toDataURL());
        
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
            id: Date.now() + '_' + index,
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
    showLoadingMessage(message) {
        this.removeExistingMessages();
        const messageDiv = document.createElement('div');
        messageDiv.className = 'message loading-message';
        messageDiv.textContent = message;
        document.querySelector('.container').insertBefore(messageDiv, document.querySelector('main'));
    }

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

    hideLoadingMessage() {
        const loadingMessage = document.querySelector('.loading-message');
        if (loadingMessage) {
            loadingMessage.parentNode.removeChild(loadingMessage);
        }
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
    new FaceRecognitionApp();
});