    document.addEventListener("DOMContentLoaded", function() {
        // ---------- AI Header Cycling Typing Effect (with erase cycle) ----------
        const aiHeader = document.querySelector('.ai-header');
        const words = JSON.parse(aiHeader.getAttribute('data-text'));
        let wordIndex = 0;
        let charIndex = 0;
        let isDeleting = false;
        const typingSpeed = 150;
        const erasingSpeed = 100;
        const delayBetweenWords = 2000;
    
        function typeCycle() {
        const currentWord = words[wordIndex];
        if (!isDeleting) {
            aiHeader.textContent = currentWord.substring(0, charIndex + 1);
            charIndex++;
            if (charIndex === currentWord.length) {
            setTimeout(() => {
                isDeleting = true;
                typeCycle();
            }, delayBetweenWords);
            return;
            }
            setTimeout(typeCycle, typingSpeed);
        } else {
            aiHeader.textContent = currentWord.substring(0, charIndex - 1);
            charIndex--;
            if (charIndex === 0) {
            isDeleting = false;
            wordIndex = (wordIndex + 1) % words.length;
            }
            setTimeout(typeCycle, erasingSpeed);
        }
        }
        typeCycle();
    
        // ---------- Static Typing Effect for Project Titles (type-once) ----------
        const projectTitles = document.querySelectorAll('.project-title');
        projectTitles.forEach(titleEl => {
        const text = titleEl.getAttribute('data-text');
        let i = 0;
        function typeProjectTitle() {
            if (i < text.length) {
            titleEl.textContent += text.charAt(i);
            i++;
            setTimeout(typeProjectTitle, 150);
            }
        }
        typeProjectTitle();
        });
    
        console.log("CV website loaded successfully!");
    });
    