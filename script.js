document.addEventListener('DOMContentLoaded', async () => {
    const video = document.getElementById('video');
    const canvas = document.getElementById('canvas');
    const context = canvas.getContext('2d');
    const overlay = document.getElementById('overlay'); // الإطار الأخضر
    const startButton = document.getElementById('startButton');
    const stopButton = document.getElementById('stopButton');
    const captureButton = document.getElementById('captureButton');
    const processingStatusElement = document.getElementById('processing-status');
    const rawTextElement = document.getElementById('raw-text');
    const productionDateDisplay = document.getElementById('production-date-display');
    const expiryDateDisplay = document.getElementById('expiry-date-display');
    const expiryStatusElement = document.getElementById('expiry-status');
    const remainingDaysElement = document.getElementById('remaining-days');

    let stream;
    let worker; // Tesseract.js worker

    // تهيئة Tesseract Worker
    async function initializeTesseract() {
        processingStatusElement.textContent = 'جاري تحميل Tesseract.js وملفات اللغة... قد يستغرق هذا وقتًا أطول في المرة الأولى.';
        processingStatusElement.style.color = '#0056b3';
        try {
            worker = await Tesseract.createWorker('eng', 1, {
                logger: m => {
                    if (m.status === 'loading eng.traineddata') {
                        processingStatusElement.textContent = `جاري تحميل ملفات اللغة: ${Math.round(m.progress * 100)}%`;
                    } else if (m.status === 'recognizing text') {
                        processingStatusElement.textContent = `جاري التعرف على النص: ${Math.round(m.progress * 100)}%`;
                    } else if (m.status === 'loaded eng.traineddata') {
                        processingStatusElement.textContent = 'ملفات اللغة جاهزة.';
                    }
                }
            });
            processingStatusElement.textContent = 'Tesseract جاهز.';
            processingStatusElement.style.color = 'green';
            return true;
        } catch (err) {
            console.error('Failed to initialize Tesseract:', err);
            processingStatusElement.textContent = 'فشل في تحميل Tesseract. تأكد من اتصالك بالإنترنت.';
            processingStatusElement.style.color = 'red';
            return false;
        }
    }

    // وظيفة بدء الكاميرا
    async function startCamera() {
        if (!worker) {
            const initialized = await initializeTesseract();
            if (!initialized) return;
        }

        try {
            stream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: 'environment' } // استخدام الكاميرا الخلفية
            });
            video.srcObject = stream;
            video.style.display = 'block';
            overlay.style.display = 'block';
            startButton.style.display = 'none';
            stopButton.style.display = 'inline-block';
            captureButton.style.display = 'inline-block';
            processingStatusElement.textContent = 'الكاميرا جاهزة. وجهها نحو التواريخ.';
            processingStatusElement.style.color = '#007bff';

            // إعادة تعيين النتائج السابقة
            rawTextElement.textContent = '';
            productionDateDisplay.textContent = '---';
            expiryDateDisplay.textContent = '---';
            expiryStatusElement.textContent = 'حالة الصلاحية: ---';
            remainingDaysElement.textContent = '---';
            expiryStatusElement.className = '';
        } catch (err) {
            console.error('Error accessing camera:', err);
            processingStatusElement.textContent = 'خطأ في الوصول إلى الكاميرا. الرجاء السماح بالوصول.';
            processingStatusElement.style.color = 'red';
        }
    }

    // وظيفة إيقاف الكاميرا
    function stopCamera() {
        if (stream) {
            stream.getTracks().forEach(track => track.stop());
            video.srcObject = null;
            video.style.display = 'none';
            overlay.style.display = 'none';
            startButton.style.display = 'inline-block';
            stopButton.style.display = 'none';
            captureButton.style.display = 'none';
            processingStatusElement.textContent = 'الكاميرا متوقفة.';
            processingStatusElement.style.color = '#666';
        }
    }

    // وظيفة التقاط الصورة وقراءة النص
    async function captureAndRecognize() {
        if (!stream) {
            processingStatusElement.textContent = 'الكاميرا ليست نشطة.';
            processingStatusElement.style.color = 'red';
            return;
        }

        processingStatusElement.textContent = 'جاري التقاط الصورة والتعرف على النص...';
        processingStatusElement.style.color = '#0056b3';
        rawTextElement.textContent = ''; // مسح النص القديم
        productionDateDisplay.textContent = '---';
        expiryDateDisplay.textContent = '---';
        expiryStatusElement.textContent = 'حالة الصلاحية: ---';
        remainingDaysElement.textContent = '---';
        expiryStatusElement.className = '';

        // تحديد المنطقة المراد قراءتها (منطقة الـ overlay)
        const videoRatio = video.videoWidth / video.videoHeight;
        const canvasRatio = canvas.width / canvas.height;

        let sx, sy, sWidth, sHeight; // Source rectangle on video
        let dx, dy, dWidth, dHeight; // Destination rectangle on canvas

        // Adjust canvas size to match video and overlay
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;

        // Calculate the crop area based on overlay dimensions
        // Get overlay's position and size relative to video (percentage)
        const overlayRect = overlay.getBoundingClientRect();
        const videoRect = video.getBoundingClientRect();

        // Calculate coordinates relative to the video frame
        // This is a complex calculation based on how object-fit and transform scaleX(-1) might affect things.
        // For simplicity, let's assume we're taking a central crop from the video.
        // A more precise approach would involve getting the exact dimensions of the overlay and its position on the video stream.
        // For now, let's target a central portion of the video as the ROI for Tesseract.
        const cropWidth = video.videoWidth * 0.8; // 80% of video width
        const cropHeight = video.videoHeight * 0.3; // 30% of video height (matching overlay)
        const cropX = (video.videoWidth - cropWidth) / 2;
        const cropY = (video.videoHeight - cropHeight) / 2;

        context.drawImage(video, cropX, cropY, cropWidth, cropHeight, 0, 0, canvas.width, canvas.height); // ارسم جزء من الفيديو على الكانفاس

        try {
            const { data: { text } } = await worker.recognize(canvas);
            rawTextElement.textContent = text; // عرض النص الخام

            // تحليل النص المستخرج للبحث عن التواريخ
            parseDates(text);

            processingStatusElement.textContent = 'تمت القراءة.';
            processingStatusElement.style.color = 'green';
        } catch (err) {
            console.error('Error during OCR:', err);
            processingStatusElement.textContent = 'خطأ أثناء القراءة. حاول مرة أخرى.';
            processingStatusElement.style.color = 'red';
        }
    }

    // وظيفة تحليل التواريخ من النص (هنحتاج نعدلها لتناسب صيغك)
    function parseDates(text) {
        let productionDate = null;
        let expiryDate = null;

        // تعبيرات منتظمة للبحث عن الصيغ (Pyr DD/MM/YY و Xpr DD/MM/YY)
        // بنفترض إن السنة 20XX
        const pyrRegex = /Pyr\s*(\d{1,2})\/(\d{1,2})\/(\d{2})/i; // Pyr DD/MM/YY
        const xprRegex = /Xpr\s*(\d{1,2})\/(\d{1,2})\/(\d{2})/i; // Xpr DD/MM/YY

        const pyrMatch = text.match(pyrRegex);
        const xprMatch = text.match(xprRegex);

        if (pyrMatch) {
            const day = parseInt(pyrMatch[1]);
            const month = parseInt(pyrMatch[2]);
            const year = parseInt(pyrMatch[3]); // YY
            // Convert YY to YYYY (assuming 20XX)
            const fullYear = (year < 70) ? (2000 + year) : (1900 + year); // Simple heuristic for 20xx
            productionDate = new Date(fullYear, month - 1, day); // month is 0-indexed
            productionDateDisplay.textContent = `${day}/${month}/${fullYear}`;
        } else {
            productionDateDisplay.textContent = 'لم يتم العثور على تاريخ الإنتاج.';
        }

        if (xprMatch) {
            const day = parseInt(xprMatch[1]);
            const month = parseInt(xprMatch[2]);
            const year = parseInt(xprMatch[3]); // YY
            const fullYear = (year < 70) ? (2000 + year) : (1900 + year); // Simple heuristic for 20xx
            expiryDate = new Date(fullYear, month - 1, day); // month is 0-indexed
            expiryDateDisplay.textContent = `${day}/${month}/${fullYear}`;
        } else {
            expiryDateDisplay.textContent = 'لم يتم العثور على تاريخ الانتهاء.';
        }

        // لو تم العثور على تاريخ انتهاء، احسب الصلاحية
        if (expiryDate && !isNaN(expiryDate.getTime())) {
            const currentDate = new Date();
            currentDate.setHours(0, 0, 0, 0);

            const diffTime = expiryDate.getTime() - currentDate.getTime();
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

            if (diffDays <= 0) {
                expiryStatusElement.textContent = 'المنتج منتهي الصلاحية!';
                expiryStatusElement.classList.remove('status-valid', 'status-warning', 'status-info');
                expiryStatusElement.classList.add('status-expired');
                remainingDaysElement.textContent = `انتهت الصلاحية منذ ${Math.abs(diffDays)} يومًا.`;
            } else if (diffDays <= 30) {
                expiryStatusElement.textContent = 'تاريخ الانتهاء يقترب!';
                expiryStatusElement.classList.remove('status-valid', 'status-expired', 'status-info');
                expiryStatusElement.classList.add('status-warning');
                remainingDaysElement.textContent = `يتبقى ${diffDays} يومًا فقط.`;
            } else {
                expiryStatusElement.textContent = 'المنتج صالح.';
                expiryStatusElement.classList.remove('status-expired', 'status-warning', 'status-info');
                expiryStatusElement.classList.add('status-valid');
                remainingDaysElement.textContent = `يتبقى ${diffDays} يومًا على انتهاء الصلاحية.`;
            }
        } else {
            expiryStatusElement.textContent = 'تاريخ انتهاء غير معروف أو غير صالح.';
            expiryStatusElement.classList.remove('status-valid', 'status-warning', 'status-expired');
            expiryStatusElement.classList.add('status-info');
            remainingDaysElement.textContent = '---';
        }
    }

    // ربط الأزرار بالوظائف
    startButton.addEventListener('click', startCamera);
    stopButton.addEventListener('click', stopCamera);
    captureButton.addEventListener('click', captureAndRecognize);
});
