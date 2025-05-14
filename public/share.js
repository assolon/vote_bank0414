// Share functionality for different platforms

// Share button and modal functionality
document.addEventListener('DOMContentLoaded', () => {
    const shareButton = document.getElementById('shareButton');
    const shareModal = document.getElementById('shareModal');

    if (shareButton && shareModal) {
        shareButton.addEventListener('click', () => {
            shareModal.classList.remove('hidden');
            setTimeout(() => {
                shareModal.classList.add('show');
            }, 10);
        });

        // 모달 외부 클릭시 닫기
        shareModal.addEventListener('click', (e) => {
            if (e.target === shareModal) {
                closeShareModal();
            }
        });
    }

    // 뒤로가기 버튼으로 모달 닫기
    window.addEventListener('popstate', () => {
        if (!shareModal.classList.contains('hidden')) {
            closeShareModal();
        }
    });
});

function closeShareModal() {
    const shareModal = document.getElementById('shareModal');
    if (!shareModal) return;
    shareModal.classList.remove('show');
    setTimeout(() => {
        shareModal.classList.add('hidden');
    }, 300);
}

// Share functions
function shareToKakao() {
    if (!Kakao.isInitialized()) {
        console.error('Kakao SDK is not initialized');
        return;
    }

    const currentVoteData = getCurrentVoteData();
    
    Kakao.Link.sendDefault({
        objectType: 'feed',
        content: {
            title: currentVoteData.question,
            description: '투표에 참여해주세요!',
            imageUrl: 'YOUR_IMAGE_URL', // 적절한 이미지 URL로 교체하세요
            link: {
                mobileWebUrl: window.location.href,
                webUrl: window.location.href
            }
        },
        buttons: [
            {
                title: '투표하러 가기',
                link: {
                    mobileWebUrl: window.location.href,
                    webUrl: window.location.href
                }
            }
        ]
    });
    closeShareModal();
}

function shareToFacebook() {
    const url = encodeURIComponent(window.location.href);
    window.open(`https://www.facebook.com/sharer/sharer.php?u=${url}`, '_blank', 'width=600,height=400');
    closeShareModal();
}

function shareToTwitter() {
    const currentVoteData = getCurrentVoteData();
    const text = encodeURIComponent(`${currentVoteData.question}\n투표에 참여해주세요!`);
    const url = encodeURIComponent(window.location.href);
    window.open(`https://twitter.com/intent/tweet?text=${text}&url=${url}`, '_blank', 'width=600,height=400');
    closeShareModal();
}

function shareToInstagram() {
    alert('Instagram sharing is not directly supported through JavaScript. Please implement a custom solution or consider using Instagram\'s sharing features through their mobile app.');
}

function shareToGmail() {
    const currentVoteData = getCurrentVoteData();
    const subject = encodeURIComponent(currentVoteData.question);
    const body = encodeURIComponent(`투표에 참여해주세요!\n${window.location.href}`);
    window.location.href = `mailto:?subject=${subject}&body=${body}`;
    closeShareModal();
}

// 현재 투표 데이터 가져오기
function getCurrentVoteData() {
    return {
        question: document.getElementById('currentQuestion').textContent,
        optionA: document.getElementById('optionAButton').textContent,
        optionB: document.getElementById('optionBButton').textContent
    };
}

// Event listeners for share buttons
document.addEventListener('DOMContentLoaded', () => {
    // Initialize event listeners for share buttons
    document.getElementById('kakaoShare').addEventListener('click', shareToKakao);
    document.getElementById('facebookShare').addEventListener('click', shareToFacebook);
    document.getElementById('twitterShare').addEventListener('click', shareToTwitter);
    document.getElementById('instagramShare').addEventListener('click', shareToInstagram);
});

// Share content configuration
const shareConfig = {
    title: '투표해주세요!', // Vote please!
    description: '여러분의 소중한 한 표를 기다립니다.', // Your precious vote is waiting
    imageUrl: 'https://your-domain.com/share-image.jpg', // Replace with your actual image URL
    link: window.location.href
};

// KakaoTalk Share
function shareToKakao() {
    if (!Kakao.isInitialized()) {
        console.error('Kakao SDK is not initialized');
        return;
    }

    Kakao.Link.sendDefault({
        objectType: 'feed',
        content: {
            title: shareConfig.title,
            description: shareConfig.description,
            imageUrl: shareConfig.imageUrl,
            link: {
                mobileWebUrl: shareConfig.link,
                webUrl: shareConfig.link
            }
        },
        buttons: [
            {
                title: '투표하러 가기', // Go to vote
                link: {
                    mobileWebUrl: shareConfig.link,
                    webUrl: shareConfig.link
                }
            }
        ]
    });
}

// Facebook Share
function shareToFacebook() {
    const url = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareConfig.link)}`;
    window.open(url, '_blank', 'width=600,height=400');
}

// Twitter Share
function shareToTwitter() {
    const text = `${shareConfig.title}\n${shareConfig.description}`;
    const url = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(shareConfig.link)}`;
    window.open(url, '_blank', 'width=600,height=400');
}

// Instagram Share
function shareToInstagram() {
    alert('Instagram sharing is not directly supported through web API. Please use the mobile app sharing feature.');
} 