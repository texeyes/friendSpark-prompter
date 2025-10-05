// FriendSpark Prompter - Main Application Logic
class FriendSparkPrompter {
    constructor() {
        this.currentSuggestions = [];
        this.currentTone = 'warm';
        this.currentSettings = {
            sincerity: 7,
            directness: 6
        };
        this.debounceTimer = null;
        
        this.initializeApp();
        this.loadPreferences();
    }

    // Tone Profiles
    toneProfiles = {
        warm: {
            maxSentences: 3,
            emojiAllowed: false,
            style: "empathetic and caring",
            hedges: ["I think", "Maybe", "Perhaps"],
            openers: ["Thanks for sharing that—", "I appreciate you telling me—", "That sounds—"],
            questionStarters: ["How did that make you feel?", "What was that like for you?", "How are you processing that?"],
            invites: ["want to chat about it over coffee", "we should catch up soon", "let's talk more about this"]
        },
        playful: {
            maxSentences: 2,
            emojiAllowed: true,
            style: "lighthearted and fun",
            hedges: ["totally", "definitely"],
            openers: ["Haha", "Oh wow", "That's so cool"],
            questionStarters: ["What's the funniest part about", "What surprised you most about", "How awesome was"],
            invites: ["want to celebrate with drinks", "we should do something fun", "let's make plans to adventure"]
        },
        curious: {
            maxSentences: 2,
            emojiAllowed: false,
            style: "inquisitive and engaged",
            hedges: ["I wonder", "I'm curious"],
            openers: ["What surprised you most about", "How did you feel when", "What was the best part of"],
            questionStarters: ["What made you decide to", "How did you figure out", "What's your take on"],
            invites: ["want to explore this topic more", "we should discuss this further", "let's dive deeper into this"]
        },
        supportive: {
            maxSentences: 3,
            emojiAllowed: false,
            style: "compassionate and reassuring",
            hedges: ["It sounds like", "I can imagine"],
            openers: ["I'm here for you", "That must have been", "I understand how"],
            questionStarters: ["How can I support you with", "What would be most helpful right now", "How are you taking care of yourself"],
            invites: ["want to talk through this together", "I'm here if you need someone", "let me know how I can help"]
        },
        brief: {
            maxSentences: 1,
            emojiAllowed: true,
            style: "concise and direct",
            hedges: [],
            openers: ["Nice!", "Cool", "Awesome"],
            questionStarters: ["How was", "What's next with", "When's"],
            invites: ["coffee soon?", "quick call?", "hang out?"]
        }
    };

    // Rationale Types
    rationaleTypes = {
        "mirror-feeling": "Reflects their emotion back",
        "ask-specific": "Asks a targeted follow-up question", 
        "invite-micro-plan": "Suggests a small meetup or activity",
        "share-story": "Invites them to share more details",
        "offer-support": "Provides comfort or assistance",
        "celebrate": "Acknowledges their achievement or joy",
        "empathize": "Shows understanding of their situation"
    };

    initializeApp() {
        this.bindEventListeners();
        this.setupKeyboardShortcuts();
        this.initializeSliders();
        this.initializeCanvas();
    }

    bindEventListeners() {
        // Input handling
        const messageInput = document.getElementById('message-input');
        messageInput.addEventListener('input', () => this.handleInputChange());
        messageInput.addEventListener('paste', () => {
            setTimeout(() => this.handleInputChange(), 100);
        });

        // Tone selection
        const toneChips = document.querySelectorAll('.tone-chip');
        toneChips.forEach(chip => {
            chip.addEventListener('click', () => this.handleToneChange(chip.dataset.tone));
        });

        // Sliders
        const sinceritySlider = document.getElementById('sincerity-slider');
        const directnessSlider = document.getElementById('directness-slider');
        sinceritySlider.addEventListener('input', () => this.handleSliderChange());
        directnessSlider.addEventListener('input', () => this.handleSliderChange());

        // Generate button
        const generateBtn = document.getElementById('generate-btn');
        generateBtn.addEventListener('click', () => this.generateSuggestions());

        // Suggestion actions
        document.addEventListener('click', (e) => {
            if (e.target.classList.contains('copy-btn')) {
                this.copySuggestion(parseInt(e.target.dataset.index));
            } else if (e.target.classList.contains('share-btn')) {
                this.shareSuggestion(parseInt(e.target.dataset.index));
            } else if (e.target.classList.contains('card-btn')) {
                this.openCardModal(parseInt(e.target.dataset.index));
            }
        });

        // Modal handling
        const modal = document.getElementById('card-modal');
        const modalClose = document.querySelector('.modal-close');
        const modalCancel = document.querySelector('.modal-cancel');
        const modalOverlay = document.querySelector('.modal-overlay');
        
        [modalClose, modalCancel, modalOverlay].forEach(element => {
            element.addEventListener('click', () => this.closeModal());
        });

        // Theme selection
        const themeOptions = document.querySelectorAll('.theme-option');
        themeOptions.forEach(option => {
            option.addEventListener('click', () => this.selectTheme(option.dataset.theme));
        });

        // Card export
        const exportBtn = document.getElementById('export-card');
        exportBtn.addEventListener('click', () => this.exportCard());

        // Accessibility toggle
        const accessibilityToggle = document.getElementById('accessibility-toggle');
        accessibilityToggle.addEventListener('click', () => this.toggleHighContrast());

        // Friend name input for card
        const friendNameInput = document.getElementById('friend-name');
        friendNameInput.addEventListener('input', () => this.updateCardPreview());
    }

    setupKeyboardShortcuts() {
        document.addEventListener('keydown', (e) => {
            // Ctrl/Cmd + Enter to generate
            if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                e.preventDefault();
                this.generateSuggestions();
            }
            
            // Number keys to copy suggestions
            if (e.key >= '1' && e.key <= '3' && !e.target.matches('input, textarea')) {
                e.preventDefault();
                const index = parseInt(e.key) - 1;
                this.copySuggestion(index);
            }
            
            // S to share (if suggestion is selected)
            if (e.key === 's' && !e.target.matches('input, textarea') && this.currentSuggestions.length > 0) {
                e.preventDefault();
                this.shareSuggestion(0); // Share first suggestion by default
            }
        });
    }

    initializeSliders() {
        const sinceritySlider = document.getElementById('sincerity-slider');
        const directnessSlider = document.getElementById('directness-slider');
        const sincerityValue = document.getElementById('sincerity-value');
        const directnessValue = document.getElementById('directness-value');

        sinceritySlider.addEventListener('input', () => {
            sincerityValue.textContent = sinceritySlider.value;
            this.currentSettings.sincerity = parseInt(sinceritySlider.value);
            this.handleSliderChange();
        });

        directnessSlider.addEventListener('input', () => {
            directnessValue.textContent = directnessSlider.value;
            this.currentSettings.directness = parseInt(directnessSlider.value);
            this.handleSliderChange();
        });
    }

    handleInputChange() {
        clearTimeout(this.debounceTimer);
        this.debounceTimer = setTimeout(() => {
            const messageInput = document.getElementById('message-input');
            if (messageInput.value.trim().length > 10) {
                this.generateSuggestions();
            }
        }, 500);
    }

    handleToneChange(tone) {
        this.currentTone = tone;
        
        // Update UI
        document.querySelectorAll('.tone-chip').forEach(chip => {
            chip.classList.remove('active');
            chip.setAttribute('aria-checked', 'false');
        });
        
        const selectedChip = document.querySelector(`[data-tone="${tone}"]`);
        selectedChip.classList.add('active');
        selectedChip.setAttribute('aria-checked', 'true');

        // Auto-regenerate suggestions if there's input
        const messageInput = document.getElementById('message-input');
        if (messageInput.value.trim().length > 10) {
            this.generateSuggestions();
        }

        this.savePreferences();
    }

    handleSliderChange() {
        // Auto-generate if there's input
        const messageInput = document.getElementById('message-input');
        if (messageInput.value.trim().length > 10) {
            clearTimeout(this.debounceTimer);
            this.debounceTimer = setTimeout(() => {
                this.generateSuggestions();
            }, 300);
        }
        this.savePreferences();
    }

    analyzeMessage(text) {
        const cleanText = text.trim().toLowerCase();
        
        // Sentiment analysis (simple keyword-based)
        const positiveWords = ['amazing', 'awesome', 'great', 'love', 'excited', 'happy', 'wonderful', 'fantastic', 'good', 'best', 'incredible', 'beautiful', 'perfect'];
        const negativeWords = ['sad', 'disappointed', 'frustrated', 'angry', 'worried', 'stressed', 'difficult', 'hard', 'tough', 'bad', 'terrible', 'horrible'];
        const questionWords = ['what', 'how', 'when', 'where', 'why', 'should', 'would', 'could'];

        let sentiment = 'neutral';
        let hasQuestion = false;
        let entities = [];
        
        // Simple sentiment detection
        const positiveCount = positiveWords.filter(word => cleanText.includes(word)).length;
        const negativeCount = negativeWords.filter(word => cleanText.includes(word)).length;
        
        if (positiveCount > negativeCount) sentiment = 'positive';
        else if (negativeCount > positiveCount) sentiment = 'negative';
        
        // Question detection
        hasQuestion = questionWords.some(word => cleanText.includes(word)) || text.includes('?');
        
        // Improved entity extraction
        const words = text.split(/\s+/);
        const stopWords = ['I', 'The', 'A', 'An', 'This', 'That', 'We', 'You', 'He', 'She', 'It', 'My', 'Our', 'Their', 'His', 'Her'];
        entities = words.filter(word => 
            word.length > 2 && 
            word[0] === word[0].toUpperCase() && 
            !stopWords.includes(word) &&
            !/^[^\w]/.test(word) // Exclude words starting with punctuation
        ).map(word => word.replace(/[^\w]/g, '')).filter(word => word.length > 0);

        // Activity and topic detection
        const activities = ['trip', 'vacation', 'work', 'job', 'school', 'class', 'meeting', 'date', 'party', 'event', 'hiking', 'travel', 'concert', 'game'];
        const detectedActivities = activities.filter(activity => cleanText.includes(activity));

        // Extract key topics/subjects
        const topics = [];
        if (cleanText.includes('hiking') || cleanText.includes('hike')) topics.push('hiking');
        if (cleanText.includes('trip') || cleanText.includes('travel')) topics.push('trip');
        if (cleanText.includes('work') || cleanText.includes('job')) topics.push('work');
        if (cleanText.includes('views') || cleanText.includes('scenery')) topics.push('views');

        return {
            sentiment,
            hasQuestion,
            entities: entities.slice(0, 3), // Limit to first 3 entities
            activities: detectedActivities,
            topics: topics,
            length: text.length,
            exclamations: (text.match(/!/g) || []).length,
            isShort: text.length < 50
        };
    }

    generateSuggestions() {
        const messageInput = document.getElementById('message-input');
        const inputText = messageInput.value.trim();
        
        if (inputText.length < 5) {
            this.showToast('Please enter a longer message');
            return;
        }

        this.showLoadingState();
        
        // Simulate processing delay for better UX
        setTimeout(() => {
            const analysis = this.analyzeMessage(inputText);
            const suggestions = this.composeSuggestions(inputText, analysis, this.currentTone, this.currentSettings);
            this.displaySuggestions(suggestions);
        }, 200);
    }

    composeSuggestions(originalText, analysis, tone, settings) {
        const profile = this.toneProfiles[tone];
        const suggestions = [];

        // Generate three different types of suggestions
        suggestions.push(this.createReflectiveSuggestion(originalText, analysis, profile, settings));
        suggestions.push(this.createQuestionSuggestion(originalText, analysis, profile, settings));
        suggestions.push(this.createInviteSuggestion(originalText, analysis, profile, settings));

        return suggestions.map(suggestion => ({
            text: this.applyToneConstraints(suggestion.text, profile, settings),
            tags: suggestion.tags
        }));
    }

    createReflectiveSuggestion(originalText, analysis, profile, settings) {
        let suggestion = '';
        const tags = ['mirror-feeling'];
        
        // Choose opener based on sentiment and tone
        let opener = profile.openers[0];
        if (analysis.sentiment === 'positive') {
            opener = profile.openers[Math.floor(Math.random() * profile.openers.length)];
            tags.push('celebrate');
        } else if (analysis.sentiment === 'negative') {
            opener = profile.style.includes('supportive') || profile.style.includes('compassionate') ? 
                "I'm here for you—" : "That sounds challenging—";
            tags.push('empathize');
        }

        // Build reflective response with better context
        if (analysis.sentiment === 'positive') {
            if (analysis.topics.length > 0) {
                const topic = analysis.topics[0];
                suggestion = `${opener} your ${topic} experience sounds absolutely incredible!`;
            } else if (analysis.activities.length > 0) {
                const activity = analysis.activities[0];
                suggestion = `${opener} your ${activity} sounds amazing!`;
            } else {
                suggestion = `${opener} it sounds like you had an incredible experience!`;
            }
        } else if (analysis.sentiment === 'negative') {
            suggestion = `${opener} that sounds really challenging to go through.`;
            tags.push('offer-support');
        } else {
            suggestion = `${opener} thank you for sharing that with me.`;
        }

        // Add empathy amplifier based on sincerity setting
        if (settings.sincerity > 7 && analysis.sentiment !== 'neutral') {
            suggestion += ' I really appreciate you opening up about this.';
        }

        return { text: suggestion, tags };
    }

    createQuestionSuggestion(originalText, analysis, profile, settings) {
        let suggestion = '';
        const tags = ['ask-specific'];
        
        // Build contextual questions
        if (analysis.topics.includes('hiking') || analysis.activities.includes('hiking')) {
            if (profile.style.includes('curious')) {
                suggestion = 'What was the most breathtaking moment during your hike?';
            } else if (profile.style.includes('fun')) {
                suggestion = 'How awesome was the view from the top?';
            } else {
                suggestion = 'How did you feel when you reached the summit?';
            }
        } else if (analysis.topics.includes('trip') || analysis.activities.includes('trip')) {
            if (profile.style.includes('curious')) {
                suggestion = 'What surprised you most about the trip?';
            } else if (profile.style.includes('fun')) {
                suggestion = 'What was the coolest part of your adventure?';
            } else {
                suggestion = 'What was your favorite moment from the trip?';
            }
        } else if (analysis.sentiment === 'positive') {
            suggestion = 'What made this experience so special for you?';
        } else if (analysis.sentiment === 'negative') {
            suggestion = 'How are you feeling about everything now?';
            tags.push('offer-support');
        } else {
            // Generic fallback
            const questionStarters = profile.questionStarters;
            const starter = questionStarters[Math.floor(Math.random() * questionStarters.length)];
            suggestion = `${starter} this experience?`;
        }

        // Adjust for directness
        if (settings.directness < 4 && !suggestion.startsWith('How') && !suggestion.startsWith('What')) {
            suggestion = `I'm curious—${suggestion.toLowerCase()}`;
        }

        tags.push('share-story');
        return { text: suggestion, tags };
    }

    createInviteSuggestion(originalText, analysis, profile, settings) {
        let suggestion = '';
        const tags = ['invite-micro-plan'];
        
        const invites = profile.invites;
        const invite = invites[Math.floor(Math.random() * invites.length)];
        
        if (analysis.sentiment === 'positive') {
            if (analysis.topics.includes('hiking') || analysis.activities.includes('trip')) {
                suggestion = `I'd love to see photos if you have any—${invite}!`;
            } else {
                suggestion = `This sounds amazing—${invite} so you can tell me all about it!`;
            }
            tags.push('celebrate');
        } else if (analysis.sentiment === 'negative') {
            suggestion = `I'm here if you need to talk—${invite}?`;
            tags.push('offer-support');
        } else {
            suggestion = `I'd love to hear more about this—${invite}?`;
        }

        // Brief tone gets much shorter invites
        if (profile.style.includes('concise')) {
            if (analysis.sentiment === 'positive') {
                suggestion = 'Awesome! Coffee soon?';
            } else {
                suggestion = 'Want to talk about it?';
            }
        }

        return { text: suggestion, tags };
    }

    applyToneConstraints(text, profile, settings) {
        let result = text;

        // Apply sentence limits
        const sentences = result.split(/[.!?]+/).filter(s => s.trim());
        if (sentences.length > profile.maxSentences) {
            result = sentences.slice(0, profile.maxSentences).join('. ') + '.';
        }

        // Add emoji if allowed and playful
        if (profile.emojiAllowed && profile.style.includes('fun') && Math.random() > 0.5) {
            const emojis = ['😊', '😄', '🎉', '✨', '🙌'];
            result += ` ${emojis[Math.floor(Math.random() * emojis.length)]}`;
        }

        // Apply directness adjustments
        if (settings.directness > 8) {
            result = result.replace(/maybe|perhaps|i think/gi, '');
            result = result.replace(/\s+/g, ' ').trim();
        }

        // Clean up any double spaces or punctuation issues
        result = result.replace(/\s+/g, ' ').trim();
        
        // Ensure proper sentence ending
        if (!result.match(/[.!?]$/)) {
            result += '.';
        }

        return result;
    }

    displaySuggestions(suggestions) {
        this.currentSuggestions = suggestions;
        this.hideLoadingState();
        
        // Show results header
        document.querySelector('.results-header').classList.remove('hidden');
        
        // Hide empty state
        document.querySelector('.empty-state').style.display = 'none';
        
        // Display suggestions
        suggestions.forEach((suggestion, index) => {
            const card = document.querySelector(`[data-index="${index}"]`);
            const textElement = card.querySelector('.suggestion-text');
            const tagsContainer = card.querySelector('.rationale-tags');
            
            textElement.textContent = suggestion.text;
            
            // Clear and populate tags
            tagsContainer.innerHTML = '';
            suggestion.tags.forEach(tag => {
                const tagElement = document.createElement('span');
                tagElement.className = 'rationale-tag';
                tagElement.textContent = tag;
                tagElement.title = this.rationaleTypes[tag] || tag;
                tagsContainer.appendChild(tagElement);
            });
            
            card.classList.remove('hidden');
        });
    }

    showLoadingState() {
        document.querySelector('.loading-skeleton').classList.remove('hidden');
        document.querySelectorAll('.suggestion-card').forEach(card => {
            card.classList.add('hidden');
        });
        
        const generateBtn = document.getElementById('generate-btn');
        generateBtn.querySelector('.btn-text').classList.add('hidden');
        generateBtn.querySelector('.btn-loading').classList.remove('hidden');
        generateBtn.disabled = true;
    }

    hideLoadingState() {
        document.querySelector('.loading-skeleton').classList.add('hidden');
        
        const generateBtn = document.getElementById('generate-btn');
        generateBtn.querySelector('.btn-text').classList.remove('hidden');
        generateBtn.querySelector('.btn-loading').classList.add('hidden');
        generateBtn.disabled = false;
    }

    async copySuggestion(index) {
        if (!this.currentSuggestions[index]) return;
        
        const text = this.currentSuggestions[index].text;
        try {
            await navigator.clipboard.writeText(text);
            this.showToast('Copied to clipboard!');
        } catch (error) {
            this.showToast('Copy failed. Please select and copy manually.');
        }
    }

    async shareSuggestion(index) {
        if (!this.currentSuggestions[index]) return;
        
        const text = this.currentSuggestions[index].text;
        try {
            if (navigator.canShare && navigator.canShare({ text })) {
                await navigator.share({
                    title: 'FriendSpark Reply',
                    text: text
                });
            } else {
                await navigator.clipboard.writeText(text);
                this.showToast('Copied to clipboard (sharing not supported)');
            }
        } catch (error) {
            if (error.name !== 'AbortError') {
                this.showToast('Share canceled');
            }
        }
    }

    openCardModal(index) {
        if (!this.currentSuggestions[index]) return;
        
        this.currentCardIndex = index;
        document.getElementById('card-modal').classList.remove('hidden');
        this.updateCardPreview();
    }

    closeModal() {
        document.getElementById('card-modal').classList.add('hidden');
    }

    selectTheme(theme) {
        document.querySelectorAll('.theme-option').forEach(option => {
            option.classList.remove('active');
        });
        document.querySelector(`[data-theme="${theme}"]`).classList.add('active');
        this.currentTheme = theme;
        this.updateCardPreview();
    }

    initializeCanvas() {
        this.currentTheme = 'ocean';
    }

    updateCardPreview() {
        if (!this.currentSuggestions[this.currentCardIndex]) return;

        const canvas = document.getElementById('reply-canvas');
        const ctx = canvas.getContext('2d');
        
        // Clear canvas
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        // Draw background gradient based on theme
        const gradients = {
            ocean: ['#1e40af', '#3b82f6', '#60a5fa'],
            sunset: ['#dc2626', '#ea580c', '#f59e0b'],
            forest: ['#166534', '#16a34a', '#22c55e'],
            lavender: ['#7c3aed', '#a855f7', '#c084fc']
        };
        
        const colors = gradients[this.currentTheme] || gradients.ocean;
        const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
        gradient.addColorStop(0, colors[0]);
        gradient.addColorStop(0.5, colors[1]);
        gradient.addColorStop(1, colors[2]);
        
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        
        // Draw content
        ctx.fillStyle = 'white';
        ctx.textAlign = 'center';
        
        // Title
        const friendName = document.getElementById('friend-name').value || 'Friend';
        ctx.font = 'bold 32px Arial, sans-serif';
        ctx.fillText(`Reply for ${friendName}`, canvas.width / 2, 80);
        
        // Message text
        ctx.font = '24px Arial, sans-serif';
        ctx.textAlign = 'left';
        const text = this.currentSuggestions[this.currentCardIndex].text;
        this.wrapText(ctx, text, 60, 150, canvas.width - 120, 32);
        
        // Tags
        const tags = this.currentSuggestions[this.currentCardIndex].tags;
        ctx.font = '18px Arial, sans-serif';
        ctx.fillText(`Style: ${tags.join(', ')}`, 60, canvas.height - 100);
        
        // Footer
        ctx.font = '16px Arial, sans-serif';
        ctx.textAlign = 'center';
        const date = new Date().toLocaleDateString();
        ctx.fillText(`Generated by FriendSpark • ${date}`, canvas.width / 2, canvas.height - 40);
    }

    wrapText(ctx, text, x, y, maxWidth, lineHeight) {
        const words = text.split(' ');
        let line = '';
        
        for (let n = 0; n < words.length; n++) {
            const testLine = line + words[n] + ' ';
            const metrics = ctx.measureText(testLine);
            const testWidth = metrics.width;
            
            if (testWidth > maxWidth && n > 0) {
                ctx.fillText(line, x, y);
                line = words[n] + ' ';
                y += lineHeight;
            } else {
                line = testLine;
            }
        }
        ctx.fillText(line, x, y);
    }

    exportCard() {
        const canvas = document.getElementById('reply-canvas');
        canvas.toBlob((blob) => {
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'friendspark-reply.png';
            a.click();
            URL.revokeObjectURL(url);
            this.showToast('Card exported!');
            this.closeModal();
        });
    }

    toggleHighContrast() {
        const isHighContrast = document.documentElement.getAttribute('data-high-contrast') === 'true';
        document.documentElement.setAttribute('data-high-contrast', !isHighContrast);
        this.showToast(!isHighContrast ? 'High contrast enabled' : 'High contrast disabled');
    }

    showToast(message) {
        const container = document.getElementById('toast-container');
        const toast = document.createElement('div');
        toast.className = 'toast';
        toast.textContent = message;
        
        container.appendChild(toast);
        
        setTimeout(() => {
            toast.remove();
        }, 3000);
    }

    savePreferences() {
        const preferences = {
            tone: this.currentTone,
            settings: this.currentSettings
        };
        
        try {
            localStorage.setItem('friendspark-preferences', JSON.stringify(preferences));
        } catch (error) {
            // Handle localStorage errors gracefully
            console.log('Could not save preferences');
        }
    }

    loadPreferences() {
        try {
            const saved = localStorage.getItem('friendspark-preferences');
            if (saved) {
                const preferences = JSON.parse(saved);
                if (preferences.tone) {
                    this.handleToneChange(preferences.tone);
                }
                if (preferences.settings) {
                    this.currentSettings = { ...this.currentSettings, ...preferences.settings };
                    document.getElementById('sincerity-slider').value = this.currentSettings.sincerity;
                    document.getElementById('directness-slider').value = this.currentSettings.directness;
                    document.getElementById('sincerity-value').textContent = this.currentSettings.sincerity;
                    document.getElementById('directness-value').textContent = this.currentSettings.directness;
                }
            }
        } catch (error) {
            // Handle localStorage errors gracefully
            console.log('Could not load preferences');
        }
    }
}

// Initialize the application when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new FriendSparkPrompter();
});