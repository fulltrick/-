class AdvancedFaceApp {
    constructor() {
        this.currentImage = null;
        this.faceDetection = null;
        this.detectedFaces = [];
        this.isModelLoaded = false;
        this.showingPreview = false;
        this.detectionSettings = {
            confidence: 0.5,
            model: 'short',
            showPreview: true
        };
        this.init();
    }

    async init() {
        this.setupEventListeners();
        await this.initializeFaceDetection();
        this.loadSavedFaces();
    }

    async initializeFaceDetection() {
        try {
            this.showLoadingMessage('高精度顔認識システムを読み込んでいます...');
            
            this.faceDetection = new FaceDetection({
                locateFile: (file) => {
                    return `https://cdn.jsdelivr.net/npm/@mediapipe/face_detection/${file}`;
                }
            });

            this.faceDetection.setOptions({
                model: this.detectionSettings.model,
                minDetectionConfidence: this.detectionSettings.confidence
            });

            this.faceDetection.onResults((results) => {
                this.onFaceDetectionResults(results);
            });

            await this.faceDetection.initialize();
            this.isModelLoaded = true;
            this.hideLoadingMessage();
            this.showSuccessMessage('高精度顔認識システムの準備が完了しました！');
            
        } catch (error) {
            console.error('MediaPipe初期化エラー:', error);
            this.hideLoadingMessage();
            this.showErrorMessage('高精度顔認識の初期化に失敗しました。シンプルモードで動作します。');
            this.enableSimpleMode();
        }
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

        // 設定関連
        document.getElementById('confidence-slider').addEventListener('input', (e) => this.updateConfidence(e));
        document.getElementById('model-select').addEventListener('change', (e) => this.updateModel(e));
        document.getElementById('preview-checkbox').addEventListener('change', (e) => this.updatePreviewSetting(e));
        document.getElementById('toggle-preview-button').addEventListener('click', () => this.togglePreview());
    }

    showTab(tab) {
        document.querySelectorAll('.tab-button').forEach(btn => btn.classList.remove('active'));
        document.getElementById(`${tab}-tab`).classList.add('active');

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
                this.showSuccessMessage('画像が読み込まれました！「顔を検出」ボタンをクリックしてください。');
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
            console.error('カメラアクセス失敗:', error);
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
            this.showSuccessMessage('写真を撮影しました！「顔を検出」ボタンをクリックしてください。');
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
        const detectButton = document.getElementById('detect-faces-button');
        if (this.isModelLoaded) {
            detectButton.textContent = '顔を検出';
        } else {
            detectButton.textContent = '顔を保存準備';
        }
    }

    hideAreasAfterImage() {
        document.getElementById('faces-area').style.display = 'none';
        document.getElementById('faces-container').innerHTML = '';
        document.getElementById('save-all-button').style.display = 'none';
    }

    async detectFaces() {
        if (!this.currentImage) {
            this.showErrorMessage('画像が選択されていません。');
            return;
        }

        if (!this.isModelLoaded) {
            this.fallbackToSimpleMode();
            return;
        }

        try {
            document.getElementById('detect-faces-button').textContent = '検出中...';
            document.getElementById('detect-faces-button').disabled = true;

            // キャンバスに画像を描画
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            canvas.width = this.currentImage.width;
            canvas.height = this.currentImage.height;
            ctx.drawImage(this.currentImage, 0, 0);

            // MediaPipeで顔検出を実行
            await this.faceDetection.send({imageData: canvas});

        } catch (error) {
            console.error('顔検出エラー:', error);
            this.showErrorMessage('顔検出中にエラーが発生しました。');
            document.getElementById('detect-faces-button').textContent = '顔を検出';
            document.getElementById('detect-faces-button').disabled = false;
        }
    }

    onFaceDetectionResults(results) {
        try {
            const detections = results.detections;
            
            if (detections && detections.length > 0) {
                this.detectedFaces = detections;
                
                // プレビュー表示
                if (this.detectionSettings.showPreview) {
                    this.drawDetectionPreview(detections);
                    document.getElementById('toggle-preview-button').style.display = 'inline-block';
                }
                
                this.displayDetectedFaces();
                document.getElementById('faces-area').style.display = 'block';
                document.getElementById('save-all-button').style.display = 'block';
                this.showSuccessMessage(`${detections.length}個の顔を検出しました！`);
            } else {
                this.showErrorMessage('顔が検出されませんでした。検出感度を下げてお試しください。');
            }
        } catch (error) {
            console.error('結果処理エラー:', error);
            this.showErrorMessage('検出結果の処理中にエラーが発生しました。');
        } finally {
            document.getElementById('detect-faces-button').textContent = '顔を検出';
            document.getElementById('detect-faces-button').disabled = false;
        }
    }

    drawDetectionPreview(detections) {
        const canvas = document.getElementById('preview-canvas');
        const ctx = canvas.getContext('2d');
        
        // キャンバスサイズを画像に合わせる
        canvas.width = this.currentImage.width;
        canvas.height = this.currentImage.height;
        canvas.style.width = this.currentImage.style.width || this.currentImage.clientWidth + 'px';
        canvas.style.height = this.currentImage.style.height || this.currentImage.clientHeight + 'px';
        
        // 画像を描画
        ctx.drawImage(this.currentImage, 0, 0);
        
        // 検出された顔に枠を描画
        detections.forEach((detection, index) => {
            const bbox = detection.boundingBox;
            const x = bbox.xCenter * canvas.width - (bbox.width * canvas.width) / 2;
            const y = bbox.yCenter * canvas.height - (bbox.height * canvas.height) / 2;
            const width = bbox.width * canvas.width;
            const height = bbox.height * canvas.height;
            
            // 顔の枠を描画
            ctx.strokeStyle = '#ff4444';
            ctx.lineWidth = 3;
            ctx.strokeRect(x, y, width, height);
            
            // 番号を表示
            ctx.fillStyle = '#ff4444';
            ctx.font = '20px Arial';
            ctx.fillText(`${index + 1}`, x, y - 5);
            
            // 信頼度を表示
            const confidence = Math.round(detection.score * 100);
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(x, y + height - 25, 60, 20);
            ctx.fillStyle = '#000000';
            ctx.font = '14px Arial';
            ctx.fillText(`${confidence}%`, x + 5, y + height - 10);
        });
        
        canvas.style.display = 'block';
        this.showingPreview = true;
    }

    // 設定関連メソッド
    updateConfidence(event) {
        this.detectionSettings.confidence = parseFloat(event.target.value);
        document.getElementById('confidence-value').textContent = event.target.value;
        
        if (this.isModelLoaded) {
            this.faceDetection.setOptions({
                model: this.detectionSettings.model,
                minDetectionConfidence: this.detectionSettings.confidence
            });
        }
    }

    updateModel(event) {
        this.detectionSettings.model = event.target.value;
        
        if (this.isModelLoaded) {
            this.faceDetection.setOptions({
                model: this.detectionSettings.model,
                minDetectionConfidence: this.detectionSettings.confidence
            });
        }
    }

    updatePreviewSetting(event) {
        this.detectionSettings.showPreview = event.target.checked;
        
        if (!this.detectionSettings.showPreview) {
            document.getElementById('preview-canvas').style.display = 'none';
            document.getElementById('toggle-preview-button').style.display = 'none';
            this.showingPreview = false;
        }
    }

    togglePreview() {
        if (this.showingPreview) {
            document.getElementById('preview-canvas').style.display = 'none';
            document.getElementById('toggle-preview-button').textContent = '検出結果を表示';
            this.showingPreview = false;
        } else {
            document.getElementById('preview-canvas').style.display = 'block';
            document.getElementById('toggle-preview-button').textContent = '元画像を表示';
            this.showingPreview = true;
        }
    }

    displayDetectedFaces() {
        const container = document.getElementById('faces-container');
        container.innerHTML = '';

        this.detectedFaces.forEach((detection, index) => {
            const faceCanvas = this.extractFaceFromDetection(detection);
            if (faceCanvas) {
                const faceItem = this.createFaceItem(faceCanvas, index);
                container.appendChild(faceItem);
            }
        });
    }

    extractFaceFromDetection(detection) {
        try {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            
            // MediaPipeの検出結果から座標を取得
            const bbox = detection.boundingBox;
            const imageWidth = this.currentImage.width;
            const imageHeight = this.currentImage.height;
            
            // 相対座標を絶対座標に変換
            const x = bbox.xCenter * imageWidth - (bbox.width * imageWidth) / 2;
            const y = bbox.yCenter * imageHeight - (bbox.height * imageHeight) / 2;
            const width = bbox.width * imageWidth;
            const height = bbox.height * imageHeight;
            
            // パディングを追加
            const padding = Math.min(width, height) * 0.2;
            const adjustedX = Math.max(0, x - padding);
            const adjustedY = Math.max(0, y - padding);
            const adjustedWidth = Math.min(imageWidth - adjustedX, width + padding * 2);
            const adjustedHeight = Math.min(imageHeight - adjustedY, height + padding * 2);
            
            canvas.width = adjustedWidth;
            canvas.height = adjustedHeight;
            
            // 顔部分を切り出し
            ctx.drawImage(
                this.currentImage,
                adjustedX, adjustedY, adjustedWidth, adjustedHeight,
                0, 0, adjustedWidth, adjustedHeight
            );
            
            return canvas;
        } catch (error) {
            console.error('顔切り出しエラー:', error);
            return null;
        }
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

    enableSimpleMode() {
        this.isModelLoaded = false;
        this.showImageArea();
    }

    fallbackToSimpleMode() {
        if (!this.currentImage) {
            this.showErrorMessage('画像が選択されていません。');
            return;
        }

        // シンプルモード：画像全体を保存
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        
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
        
        this.showSuccessMessage('シンプルモードで画像を準備しました。名前を入力して保存してください。');
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
        
        setTimeout(() => {
            if (messageDiv.parentNode) {
                messageDiv.parentNode.removeChild(messageDiv);
            }
        }, 5000);
    }

    hideLoadingMessage() {
        const loadingMessage = document.querySelector('.loading-message');
        if (loadingMessage && loadingMessage.parentNode) {
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
    new AdvancedFaceApp();
});