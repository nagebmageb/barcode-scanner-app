document.addEventListener('DOMContentLoaded', (event) => {
    const startButton = document.getElementById('startButton');
    const stopButton = document.getElementById('stopButton');
    const barcodeValueElement = document.getElementById('barcode-value');
    const detectionStatusElement = document.getElementById('detection-status');
    const interactiveViewport = document.getElementById('interactive');

    let scannerRunning = false;

    // وظيفة تهيئة وبدء الماسح الضوئي
    function startScanner() {
        // إذا كان الماسح يعمل بالفعل، لا تفعل شيئًا
        if (scannerRunning) return;

        // تهيئة QuaggaJS
        Quagga.init({
            inputStream: {
                name: "Live",
                type: "LiveStream",
                target: interactiveViewport, // تحديد العنصر الذي سيتم عرض الكاميرا فيه
                constraints: {
                    width: 640,
                    height: 480,
                    facingMode: "environment" // استخدام الكاميرا الخلفية (إذا كانت متاحة على الموبايل)
                },
            },
            decoder: {
                readers: ["ean_reader", "code_128_reader", "upc_reader"] // أنواع الباركود التي سيتم قراءتها
            },
            locate: true, // لتحديد مكان الباركود على الشاشة (يرسم مربع حوله)
            // debugging: true // لإظهار معلومات تصحيح الأخطاء (يمكن إزالته لاحقًا)
        }, function(err) {
            if (err) {
                console.error(err);
                detectionStatusElement.textContent = `خطأ في بدء الكاميرا: ${err.message || err}. تأكد من السماح بالوصول للكاميرا.`;
                detectionStatusElement.style.color = 'red';
                // إخفاء الأزرار إذا لم يتمكن من بدء الكاميرا
                startButton.style.display = 'inline-block';
                stopButton.style.display = 'none';
                return;
            }
            Quagga.start();
            scannerRunning = true;
            startButton.style.display = 'none';
            stopButton.style.display = 'inline-block';
            detectionStatusElement.textContent = 'الكاميرا جاهزة. قم بتوجيهها نحو الباركود.';
            detectionStatusElement.style.color = 'green';
        });

        // عند اكتشاف باركود
        Quagga.onDetected(function(result) {
            if (result && result.codeResult && result.codeResult.code) {
                const code = result.codeResult.code;
                barcodeValueElement.textContent = `الباركود المقروء: ${code}`;
                detectionStatusElement.textContent = 'تم الكشف بنجاح!';
                detectionStatusElement.style.color = 'blue';

                // يمكنك هنا إضافة منطق لمعالجة الباركود المقروء
                // مثلاً:
                // - إرسال الكود إلى خادم للتحقق من معلومات المنتج.
                // - عرض تفاصيل المنتج مباشرةً على الصفحة.
                // - تفعيل صوت عند القراءة الناجحة.
                // Quagga.stop(); // يمكن إيقاف الكاميرا تلقائيًا بعد أول قراءة ناجحة
                // scannerRunning = false;
                // startButton.style.display = 'inline-block';
                // stopButton.style.display = 'none';
            }
        });

        // عند معالجة كل إطار فيديو (لرسم المربع حول الباركود)
        Quagga.onProcessed(function(result) {
            var drawingCtx = Quagga.canvas.ctx.overlay,
                drawingCanvas = Quagga.canvas.dom.overlay;

            if (result) {
                if (result.boxes) {
                    drawingCtx.clearRect(0, 0, parseInt(drawingCanvas.getAttribute("width")), parseInt(drawingCanvas.getAttribute("height")));
                    result.boxes.filter(function (box) {
                        return box !== result.box;
                    }).forEach(function (box) {
                        Quagga.ImageDebug.drawPath(box, {x: 0, y: 1}, drawingCtx, {color: "green", lineWidth: 2});
                    });
                }

                if (result.box) {
                    Quagga.ImageDebug.drawPath(result.box, {x: 0, y: 1}, drawingCtx, {color: "#00F", lineWidth: 2});
                }

                if (result.codeResult && result.codeResult.code) {
                    Quagga.ImageDebug.drawPath(result.line, {x: 'x', y: 'y'}, drawingCtx, {color: 'red', lineWidth: 3});
                }
            }
        });
    }

    // وظيفة إيقاف الماسح الضوئي
    function stopScanner() {
        if (scannerRunning) {
            Quagga.stop();
            scannerRunning = false;
            startButton.style.display = 'inline-block';
            stopButton.style.display = 'none';
            barcodeValueElement.textContent = 'الباركود المقروء: ---';
            detectionStatusElement.textContent = 'الماسح الضوئي متوقف.';
            detectionStatusElement.style.color = '#555';
            // إزالة أي محتوى فيديو سابقًا لتنظيف الواجهة
            while (interactiveViewport.firstChild) {
                interactiveViewport.removeChild(interactiveViewport.firstChild);
            }
        }
    }

    // ربط الأزرار بالوظائف عند تحميل الصفحة
    startButton.addEventListener('click', startScanner);
    stopButton.addEventListener('click', stopScanner);

    // يمكنك بدء الماسح الضوئي تلقائيًا عند تحميل الصفحة إذا أردت
    // startScanner();
});
