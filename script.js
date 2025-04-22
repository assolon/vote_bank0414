// Firebase configuration
const firebaseConfig = {
    apiKey: "AIzaSyAR8ghUYNf6X3qFByRoc3oB9awTViBGHfM",
    authDomain: "vote-bank0414.firebaseapp.com",
    projectId: "vote-bank0414",
    storageBucket: "vote-bank0414.firebasestorage.app",
    messagingSenderId: "807287894593",
    appId: "1:807287894593:web:3ee2544444617cf5338cc0",
    measurementId: "G-WC7GM5GSS1"
};

// Initialize Firebase
const app = firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

let currentVoteId = null;
let isAdmin = false;  // 관리자 상태를 추적하는 변수

// 페이지 로드 시 초기화
document.addEventListener('DOMContentLoaded', () => {
    const urlParams = new URLSearchParams(window.location.search);
    isAdmin = urlParams.get('admin') === 'true';
    if (isAdmin) {
        showAdminPage();
    } else {
        showUserPage();
    }
    loadCurrentVote();
});

// 전역 함수들을 window 객체에 추가
window.showAdminPage = function() {
    document.getElementById('admin-section').classList.remove('hidden');
    document.getElementById('user-section').classList.add('hidden');
    loadVoteList();
}

window.showUserPage = function() {
    document.getElementById('admin-section').classList.add('hidden');
    document.getElementById('user-section').classList.remove('hidden');
    loadCurrentVote();
}

window.saveVote = async function() {
    const question = document.getElementById('question').value;
    const optionA = document.getElementById('optionA').value;
    const optionB = document.getElementById('optionB').value;
    const exposureTime = document.getElementById('exposureTime').value;

    if (!question || !optionA || !optionB || !exposureTime) {
        alert('모든 필드를 입력해주세요');
        return;
    }

    try {
        await db.collection('votes').add({
            question,
            optionA,
            optionB,
            exposureTime: new Date(exposureTime),
            votesA: 0,
            votesB: 0,
            status: 'active',
            createdAt: new Date()
        });

        // 폼 초기화
        document.getElementById('question').value = '';
        document.getElementById('optionA').value = '';
        document.getElementById('optionB').value = '';
        document.getElementById('exposureTime').value = '';

        // 투표 목록 새로고침
        loadVoteList();
    } catch (error) {
        console.error('Error saving vote:', error);
        alert('투표 저장 중 오류가 발생했습니다');
    }
}

window.vote = async function(option) {
    try {
        if (!currentVoteId) {
            alert('현재 진행 중인 투표가 없습니다.');
            return;
        }

        const voteRef = db.collection('votes').doc(currentVoteId);
        const voteDoc = await voteRef.get();
        
        if (!voteDoc.exists) {
            console.error('Vote not found');
            return;
        }

        // 투표 데이터 업데이트
        const updateData = {};
        if (option === 'A') {
            updateData.votesA = firebase.firestore.FieldValue.increment(1);
        } else {
            updateData.votesB = firebase.firestore.FieldValue.increment(1);
        }

        await voteRef.update(updateData);

        // 투표 후 결과 즉시 업데이트
        const updatedDoc = await voteRef.get();
        const updatedData = updatedDoc.data();
        updateResults(updatedData.votesA || 0, updatedData.votesB || 0);
        
    } catch (error) {
        console.error('Error voting:', error);
        alert('투표 중 오류가 발생했습니다.');
    }
}

window.endVote = async function(voteId) {
    try {
        await db.collection('votes').doc(voteId).update({
            status: 'ended',
            endedAt: new Date()
        });
        loadVoteList();
    } catch (error) {
        console.error('Error ending vote:', error);
        alert('투표 종료 중 오류가 발생했습니다');
    }
}

window.showPreviousVotes = async function() {
    try {
        const now = new Date();
        const querySnapshot = db.collection('votes')
            .where('status', '==', 'ended')
            .orderBy('endedAt', 'desc');
        const previousVotesBody = document.getElementById('previousVotesBody');
        previousVotesBody.innerHTML = '';

        await querySnapshot.get().then(snapshot => {
            snapshot.forEach(doc => {
                const vote = doc.data();
                const endTime = vote.endedAt.toDate();
                const exposureTime = new Date(endTime.getTime() + 60 * 60 * 1000);

                if (now > endTime && now > exposureTime) {
                    const row = document.createElement('tr');
                    const leftVotes = vote.votesA || 0;
                    const rightVotes = vote.votesB || 0;
                    const leftPercentage = calculatePercentage(leftVotes, rightVotes);
                    const rightPercentage = calculatePercentage(rightVotes, leftVotes);
                    
                    const leftStyle = leftVotes > rightVotes ? 'color: #2196F3; font-weight: bold;' : '';
                    const rightStyle = rightVotes > leftVotes ? 'color: #2196F3; font-weight: bold;' : '';
                    
                    row.innerHTML = `
                        <td>${endTime.toLocaleString('ko-KR', {
                            year: 'numeric',
                            month: '2-digit',
                            day: '2-digit',
                            hour: '2-digit',
                            minute: '2-digit'
                        })}</td>
                        <td>${vote.optionA}</td>
                        <td>${vote.optionB}</td>
                        <td style="${leftStyle}">${leftVotes} (${leftPercentage}%)</td>
                        <td style="${rightStyle}">${rightVotes} (${rightPercentage}%)</td>
                    `;
                    
                    previousVotesBody.appendChild(row);
                }
            });
        });

        document.getElementById('previousVotesModal').classList.remove('hidden');
    } catch (error) {
        console.error('Error loading previous votes:', error);
        alert('이전 투표 목록을 불러오는 중 오류가 발생했습니다');
    }
}

window.closePreviousVotes = function() {
    document.getElementById('previousVotesModal').classList.add('hidden');
}

// 내부 함수들
async function loadVoteList() {
    const voteListBody = document.getElementById('voteListBody');
    voteListBody.innerHTML = '';

    try {
        const snapshot = await db.collection('votes')
            .orderBy('exposureTime', 'desc')
            .get();
        
        const now = new Date();
        
        snapshot.forEach(doc => {
            const vote = doc.data();
            const row = document.createElement('tr');
            
            const exposureTime = vote.exposureTime.toDate();
            const endTime = new Date(exposureTime.getTime() + 60 * 60 * 1000);
            
            let status;
            let actionButton = '';
            
            if (vote.status === 'ended') {
                status = '종료됨';
            } else if (now < exposureTime) {
                status = '대기중';
            } else if (now > endTime) {
                status = '종료됨';
                db.collection('votes').doc(doc.id).update({ status: 'ended' });
            } else {
                status = '진행중';
                actionButton = `<button onclick="endVote('${doc.id}')" class="end-vote-btn">종료</button>`;
            }

            const leftVotes = vote.votesA || 0;
            const rightVotes = vote.votesB || 0;
            const leftPercentage = calculatePercentage(leftVotes, rightVotes);
            const rightPercentage = calculatePercentage(rightVotes, leftVotes);
            
            row.innerHTML = `
                <td>${exposureTime.toLocaleString('ko-KR', {
                    year: 'numeric',
                    month: '2-digit',
                    day: '2-digit',
                    hour: '2-digit',
                    minute: '2-digit'
                })}</td>
                <td>${vote.optionA}</td>
                <td>${vote.optionB}</td>
                <td>${leftVotes} (${leftPercentage}%)</td>
                <td>${rightVotes} (${rightPercentage}%)</td>
                <td>${status}${actionButton}</td>
            `;
            
            voteListBody.appendChild(row);
        });
    } catch (error) {
        console.error('Error loading vote list:', error);
    }
}

async function loadCurrentVote() {
    try {
        const now = new Date();
        const snapshot = await db.collection('votes')
            .where('status', '==', 'active')
            .where('exposureTime', '<=', now)
            .orderBy('exposureTime', 'desc')
            .limit(1)
            .get();

        if (snapshot.empty) {
            document.getElementById('currentQuestion').textContent = '현재 진행중인 투표가 없습니다.';
            document.querySelector('.vote-options').style.display = 'none';
            document.querySelector('.result-graph').style.display = 'none';
            currentVoteId = null;
            return;
        }

        const voteDoc = snapshot.docs[0];
        const voteData = voteDoc.data();
        currentVoteId = voteDoc.id;

        // 질문과 투표 옵션 업데이트
        document.getElementById('currentQuestion').textContent = voteData.question;
        document.getElementById('optionAButton').textContent = voteData.optionA;
        document.getElementById('optionBButton').textContent = voteData.optionB;

        // 투표 옵션과 그래프 표시
        document.querySelector('.vote-options').style.display = 'flex';
        document.querySelector('.result-graph').style.display = 'block';

        // 초기 결과 업데이트
        updateResults(voteData.votesA || 0, voteData.votesB || 0);

        // 실시간 업데이트 리스너 설정
        db.collection('votes').doc(currentVoteId)
            .onSnapshot((doc) => {
                if (doc.exists) {
                    const data = doc.data();
                    updateResults(data.votesA || 0, data.votesB || 0);
                }
            });

    } catch (error) {
        console.error('Error loading current vote:', error);
        alert('현재 투표를 불러오는 중 오류가 발생했습니다');
    }
}

// 1분마다 현재 투표 상태 업데이트
setInterval(loadCurrentVote, 60000);

function updateResults(votesA, votesB) {
    const total = votesA + votesB;
    const percentageA = total === 0 ? 50 : (votesA / total) * 100;
    const percentageB = total === 0 ? 50 : (votesB / total) * 100;

    const barA = document.getElementById('barA');
    const barB = document.getElementById('barB');

    barA.style.width = `${percentageA}%`;
    barB.style.width = `${percentageB}%`;

    barA.textContent = `${Math.round(percentageA)}%`;
    barB.textContent = `${Math.round(percentageB)}%`;

    document.getElementById('countA').textContent = `${votesA}표`;
    document.getElementById('countB').textContent = `${votesB}표`;
}

function calculatePercentage(votes, otherVotes) {
    const total = votes + otherVotes;
    return total === 0 ? 0 : Math.round((votes / total) * 100);
}
