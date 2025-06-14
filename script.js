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

    // تهيئة Tesseract Worker مع دعم اللغتين الإنجليزية والعربية
    async function initializeTesseract() {
        processingStatusElement.textContent = 'جاري تحميل Tesseract.js وملفات اللغة (إنجليزية وعربية)... قد يستغرق هذا وقتًا أطول في المرة الأولى.';
        processingStatusElement.style.color = '#0056b3';
        try {
            // استخدام 'eng+ara' لتمكين التعرف على اللغتين
            worker = await Tesseract.createWorker('eng+ara', 1, {
                logger: m => {
                    if (m.status === 'loading eng.traineddata') {
                        processingStatusElement.textContent = `جاري تحميل ملفات اللغة الإنجليزية: ${Math.round(m.progress * 100)}%`;
                    } else if (m.status === 'loading ara.traineddata') {
                        processingStatusElement.textContent = `جاري تحميل ملفات اللغة العربية: ${Math.round(m.progress * 100)}%`;
                    } else if (m.status === 'recognizing text') {
                        processingStatusElement.textContent = `جاري التعرف على النص: ${Math.round(m.progress * 100)}%`;
                    } else if (m.status === 'loaded eng.traineddata' && m.progress === 1) {
                        // حالة خاصة بعد اكتمال تحميل اللغة الإنجليزية
                    } else if (m.status === 'loaded ara.traineddata' && m.progress === 1) {
                        // حالة خاصة بعد اكتمال تحميل اللغة العربية
                    }
                    // تحديث الحالة العامة فقط بعد اكتمال التحميلات
                    if (m.status === 'initialized' && m.progress === 1) {
                         processingStatusElement.textContent = 'Tesseract جاهز.';
                         processingStatusElement.style.color = 'green';
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
            // تفضيل الكاميرا الخلفية (environment)
            stream = await navigator.mediaDevices.getUserMedia({
                video: {
                    facingMode: 'environment',
                    width: { ideal: 1280 }, // جودة عالية للفيديو
                    height: { ideal: 720 }
                }
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
            // في حالة الخطأ، أظهر زر البدء مرة أخرى
            startButton.style.display = 'inline-block';
            stopButton.style.display = 'none';
            captureButton.style.display = 'none';
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
            processingStatusElement.textContent = 'الكاميرا ليست نشطة. يرجى بدء الكاميرا أولاً.';
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

        // تأكد من أن الفيديو جاهز للعرض قبل الرسم
        if (video.readyState < video.HAVE_ENOUGH_DATA) {
            await new Promise(resolve => video.oncanplay = resolve);
        }

        // ضبط أبعاد الكانفاس لتتناسب مع أبعاد الفيديو الحقيقية
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;

        // حساب منطقة الاقتصاص (Crop area) بناءً على الـ overlay
        // الأوفرلاي بيشكل 80% عرض و 30% ارتفاع في منتصف الشاشة
        const cropWidth = canvas.width * 0.8;
        const cropHeight = canvas.height * 0.3;
        const cropX = (canvas.width - cropWidth) / 2;
        const cropY = (canvas.height - cropHeight) / 2;

        // ارسم الجزء المحدد من الفيديو على الكانفاس
        context.drawImage(video, cropX, cropY, cropWidth, cropHeight, 0, 0, canvas.width, canvas.height);

        try {
            const { data: { text } } = await worker.recognize(canvas);
            rawTextElement.textContent = text; // عرض النص الخام المقروء

            // تحليل النص المستخرج للبحث عن التواريخ
            parseDates(text);

            processingStatusElement.textContent = 'تمت القراءة بنجاح.';
            processingStatusElement.style.color = 'green';
        } catch (err) {
            console.error('Error during OCR:', err);
            processingStatusElement.textContent = 'خطأ أثناء القراءة. حاول مرة أخرى. (تأكد من وضوح الصورة)';
            processingStatusElement.style.color = 'red';
        }
    }

    // وظيفة تحليل التواريخ من النص (محدثة لتناسب صيغ PRD و EXP)
    function parseDates(text) {
        let productionDate = null;
        let expiryDate = null;

        // تعبيرات منتظمة للبحث عن الصيغ (PRD DD/MM/YY و EXP DD/MM/YY)
        // \s* أي مسافة أو لا
        // (\d{1,2}) أي رقم أو رقمين لليوم/الشهر
        // (\d{2}) أي رقمين للسنة
        const prdRegex = /(?:PRD|PYR)\s*[\*]?\s*(\d{1,2})\/(\d{1,2})\/(\d{2})/i; // PRD/PYR DD/MM/YY
        const expRegex = /(?:EXP|XPR)\s*[\*]?\s*(\d{1,2})\/(\d{1,2})\/(\d{2})/i; // EXP/XPR DD/MM/YY

        const prdMatch = text.match(prdRegex);
        const expMatch = text.match(expRegex);

        // معالجة تاريخ الإنتاج
        if (prdMatch) {
            const day = parseInt(prdMatch[1]);
            const month = parseInt(prdMatch[2]);
            const year = parseInt(prdMatch[3]); // YY
            // تحويل YY إلى XXXX (افتراض أن السنوات 2000 فما فوق)
            // لو السنة 25، يبقى 2025، لو 98 يبقى 1998 (ده افتراض عام)
            const fullYear = (year > (new Date().getFullYear() % 100) + 10) ? (1900 + year) : (2000 + year); // تعديل بسيط للتعامل مع السنوات المستقبلية والقريبة
            
            productionDate = new Date(fullYear, month - 1, day); // الشهر 0-indexed
            // التحقق من صلاحية التاريخ قبل العرض
            if (!isNaN(productionDate.getTime())) {
                productionDateDisplay.textContent = `${day}/${month}/${fullYear}`;
            } else {
                productionDateDisplay.textContent = 'تاريخ إنتاج غير صالح';
            }
        } else {
            productionDateDisplay.textContent = 'لم يتم العثور على تاريخ الإنتاج.';
        }

        // معالجة تاريخ الانتهاء
        if (expMatch) {
            const day = parseInt(expMatch[1]);
            const month = parseInt(expMatch[2]);
            const year = parseInt(expMatch[3]); // YY
            const fullYear = (year > (new Date().getFullYear() % 100) + 10) ? (1900 + year) : (2000 + year);
            
            expiryDate = new Date(fullYear, month - 1, day); // الشهر 0-indexed
             // التحقق من صلاحية التاريخ قبل العرض
            if (!isNaN(expiryDate.getTime())) {
                expiryDateDisplay.textContent = `${day}/${month}/${fullYear}`;
            } else {
                expiryDateDisplay.textContent = 'تاريخ انتهاء غير صالح';
            }
        } else {
            expiryDateDisplay.textContent = 'لم يتم العثور على تاريخ الانتهاء.';
        }

        // لو تم العثور على تاريخ انتهاء وصالح، احسب الصلاحية
        if (expiryDate && !isNaN(expiryDate.getTime())) {
            const currentDate = new Date();
            // تصفير الوقت الحالي للمقارنة بالتواريخ فقط
            currentDate.setHours(0, 0, 0, 0);

            // مقارنة التاريخ
            const diffTime = expiryDate.getTime() - currentDate.getTime();
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)); // الأيام المتبقية أو المنتهية

            if (diffDays <= 0) { // منتهي الصلاحية أو انتهى اليوم
                expiryStatusElement.textContent = 'المنتج منتهي الصلاحية!';
                expiryStatusElement.classList.remove('status-valid', 'status-warning', 'status-info');
                expiryStatusElement.classList.add('status-expired');
                remainingDaysElement.textContent = `انتهت الصلاحية منذ ${Math.abs(diffDays)} يومًا.`;
            } else if (diffDays <= 30) { // يقترب من الانتهاء (أقل من أو يساوي 30 يوم)
                expiryStatusElement.textContent = 'تاريخ الانتهاء يقترب!';
                expiryStatusElement.classList.remove('status-valid', 'status-expired', 'status-info');
                expiryStatusElement.classList.add('status-warning');
                remainingDaysElement.textContent = `يتبقى ${diffDays} يومًا فقط.`;
            } else { // صالح
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
