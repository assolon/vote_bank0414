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

// Service Worker 등록
if ('serviceWorker' in navigator) {
    window.addEventListener('load', async () => {
        try {
            // 기존 서비스워커 제거
            const registrations = await navigator.serviceWorker.getRegistrations();
            for (let registration of registrations) {
                await registration.unregister();
            }
            
            // 새로운 서비스워커 등록
            const registration = await navigator.serviceWorker.register('/service-worker.js');
            console.log('ServiceWorker registration successful');
            
            // 업데이트 확인 및 강제 새로고침
            if (registration.waiting) {
                registration.waiting.postMessage({ type: 'SKIP_WAITING' });
            }
            
            registration.addEventListener('activate', () => {
                window.location.reload();
            });
        } catch (err) {
            console.log('ServiceWorker registration failed: ', err);
        }
    });
}

// Initialize Firebase
const app = firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

let currentVoteId = null;
let isAdmin = false;
let selectedOption = null;
let selectedGender = null;

// 기존 데이터 마이그레이션 함수
async function migrateOldVotes() {
    try {
        const snapshot = await db.collection('votes').get();
        let migrationNeeded = false;
        
        for (const doc of snapshot.docs) {
            const voteData = doc.data();
            const statsRef = db.collection('voteStats').doc(doc.id);
            const statsDoc = await statsRef.get();
            
            if (!statsDoc.exists || !statsDoc.data().detailedStats) {
                migrationNeeded = true;
                
                // 기존 통계 데이터 가져오기
                const oldStatsData = statsDoc.exists ? statsDoc.data() : {
                    genderStats: {
                        male: { A: 0, B: 0 },
                        female: { A: 0, B: 0 }
                    },
                    ageStats: {
                        '10대': { A: 0, B: 0 },
                        '20대': { A: 0, B: 0 },
                        '30대': { A: 0, B: 0 },
                        '40대': { A: 0, B: 0 },
                        '50대': { A: 0, B: 0 },
                        '60대이상': { A: 0, B: 0 }
                    }
                };

                // 상세 통계 데이터 생성
                const detailedStats = {
                    male: {},
                    female: {}
                };

                // 각 성별에 대해
                ['male', 'female'].forEach(gender => {
                    // 각 연령대에 대해
                    ['10대', '20대', '30대', '40대', '50대', '60대이상'].forEach(age => {
                        detailedStats[gender][age] = { A: 0, B: 0 };
                    });
                });

                // 새로운 통계 데이터 저장
                await statsRef.set({
                    ...oldStatsData,
                    detailedStats
                });
                
                console.log(`Migrated vote statistics: ${doc.id}`);
            }
        }
        
        if (migrationNeeded) {
            console.log('Migration completed');
            await loadVoteList();
        }
    } catch (error) {
        console.error('Error during migration:', error);
    }
}

// 페이지 로드 시 초기화
document.addEventListener('DOMContentLoaded', async () => {
    console.log('페이지 로드됨');
    
    // 도메인으로 관리자/사용자 페이지 구분
    const hostname = window.location.hostname;
    isAdmin = hostname.includes('admin');
    
    // 기존 데이터 마이그레이션
    await migrateOldVotes();
    
    if (isAdmin) {
    document.getElementById('admin-section').classList.remove('hidden');
    document.getElementById('user-section').classList.add('hidden');
    loadVoteList();
    } else {
        document.getElementById('admin-section').classList.add('hidden');
        document.getElementById('user-section').classList.remove('hidden');
        loadCurrentVote();
    }

    const ageSelect = document.getElementById('ageGroup');
    if (ageSelect) {
        ageSelect.addEventListener('change', checkSubmitButton);
    }

    if (!isAdmin) {
        document.body.addEventListener('submit', async function(e) {
            if (e.target && e.target.id === 'voteRequestForm') {
                e.preventDefault();
                const requestData = {
                    question: document.getElementById('requestTitle').value,
                    optionA: document.getElementById('requestOptionA').value,
                    optionB: document.getElementById('requestOptionB').value,
                    registerId: document.getElementById('requestRegisterId').value,
                    status: '신청',
                    votesA: 0,
                    votesB: 0,
                    createdAt: firebase.firestore.FieldValue.serverTimestamp()
                };
                try {
                    await db.collection('votes').add(requestData);
                    alert('투표가 성공적으로 신청되었습니다.');
                    closeVoteRequest();
                    if (isAdmin) {
                        loadVoteList();
                    }
                } catch (error) {
                    console.error('Error submitting vote request:', error);
                    alert('투표 신청 중 오류가 발생했습니다.');
                }
            }
        });
    }
});

// 관리자 폼 초기화 함수
function clearAdminForm() {
    document.getElementById('question').value = '';
    document.getElementById('optionA').value = '';
    document.getElementById('optionB').value = '';
    document.getElementById('startTime').value = '';
    document.getElementById('endTime').value = '';
}

function showUserPage() {
    document.getElementById('admin-section').classList.add('hidden');
    document.getElementById('user-section').classList.remove('hidden');
    loadCurrentVote();
}

// 기간 중복 체크 함수
async function checkPeriodOverlap(startTime, endTime, currentVoteId = null) {
    try {
        const votesRef = db.collection('votes');
        const snapshot = await votesRef
            .where('status', '!=', 'ended') // 종료된 투표 제외
            .get();
        
        const newStart = new Date(startTime);
        const newEnd = new Date(endTime);
        
        for (const doc of snapshot.docs) {
            // 현재 수정 중인 투표는 제외
            if (currentVoteId && doc.id === currentVoteId) continue;
            
            const vote = doc.data();
            const existingStart = vote.startTime.toDate();
            const existingEnd = vote.endTime.toDate();
            
            // 기간 중복 체크
            if (
                (newStart >= existingStart && newStart <= existingEnd) || // 새 시작일이 기존 기간 내에 있는 경우
                (newEnd >= existingStart && newEnd <= existingEnd) || // 새 종료일이 기존 기간 내에 있는 경우
                (newStart <= existingStart && newEnd >= existingEnd) // 새 기간이 기존 기간을 포함하는 경우
            ) {
                return {
                    overlap: true,
                    existingVote: {
                        start: formatDateTime(existingStart),
                        end: formatDateTime(existingEnd),
                        status: vote.status
                    }
                };
            }
        }
        return { overlap: false };
    } catch (error) {
        console.error('Error checking period overlap:', error);
        throw error;
    }
}

// 투표 저장 함수
async function saveVote() {
    const question = document.getElementById('question').value;
    const optionA = document.getElementById('optionA').value;
    const optionB = document.getElementById('optionB').value;
    const startTime = document.getElementById('startTime').value;
    const endTime = document.getElementById('endTime').value;

    if (!question || !optionA || !optionB || !startTime || !endTime) {
        alert('모든 필드를 입력해주세요');
        return;
    }

    const start = new Date(startTime);
    const end = new Date(endTime);

    if (end <= start) {
        alert('마감일시는 시작일시보다 늦어야 합니다');
        return;
    }

    try {
        // 기간 중복 체크
        const overlapCheck = await checkPeriodOverlap(startTime, endTime);
        if (overlapCheck.overlap) {
            alert(`다음 기간과 중복됩니다:\n${overlapCheck.existingVote.start} ~ ${overlapCheck.existingVote.end}`);
            return;
        }

        await db.collection('votes').add({
            question,
            optionA,
            optionB,
            startTime: firebase.firestore.Timestamp.fromDate(start),
            endTime: firebase.firestore.Timestamp.fromDate(end),
            votesA: 0,
            votesB: 0,
            status: 'waiting',
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });

        // 폼 초기화
        clearAdminForm();
        alert('투표가 저장되었습니다.');

        // 투표 목록 새로고침
        loadVoteList();
    } catch (error) {
        console.error('Error saving vote:', error);
        alert('투표 저장 중 오류가 발생했습니다');
    }
}

// 투표 목록 로드 함수
async function loadVoteList() {
    const voteListBody = document.getElementById('voteListBody');
    voteListBody.innerHTML = '';

    try {
        const snapshot = await db.collection('votes')
            .orderBy('createdAt', 'desc')
            .get();
        
        const now = new Date();
        
        snapshot.forEach(doc => {
            const vote = doc.data();
            const row = document.createElement('tr');
            
            // 상태 및 기간 설정
            let status = vote.status;
            let periodDisplay = '';
            let actionButtons = '';
            
            if (status === '신청') {
                // 신청 상태일 때
                periodDisplay = '노출기간 미설정';
                actionButtons = `
                    <button onclick="editVote('${doc.id}')" class="edit-btn">수정</button>
                    <button onclick="deleteVote('${doc.id}')" class="delete-btn">삭제</button>
                `;
            } else {
                // 기존 상태 처리
                const startTime = vote.startTime ? vote.startTime.toDate() : null;
                const endTime = vote.status === 'ended' && vote.endedAt ? 
                    vote.endedAt.toDate() : 
                    (vote.endTime ? vote.endTime.toDate() : null);

                if (startTime && endTime) {
                    periodDisplay = `${formatDateTime(startTime)} ~ ${formatDateTime(endTime)}`;
                    
                    if (vote.status === 'ended') {
                        status = '종료됨';
                        actionButtons = `<button onclick="deleteVote('${doc.id}')" class="delete-btn">삭제</button>`;
                    } else if (now < startTime) {
                        status = '대기중';
                        actionButtons = `
                            <button onclick="editVote('${doc.id}')" class="edit-btn">수정</button>
                            <button onclick="deleteVote('${doc.id}')" class="delete-btn">삭제</button>
                        `;
                    } else if (now > endTime) {
                        status = '종료됨';
                        actionButtons = `<button onclick="deleteVote('${doc.id}')" class="delete-btn">삭제</button>`;
                        // 자동으로 상태 업데이트
                        db.collection('votes').doc(doc.id).update({ 
                            status: 'ended',
                            endedAt: firebase.firestore.Timestamp.fromDate(endTime)
                        });
                    } else {
                        status = '진행중';
                        actionButtons = `
                            <button onclick="endVote('${doc.id}')" class="end-vote-btn">종료</button>
                            <button onclick="deleteVote('${doc.id}')" class="delete-btn">삭제</button>
                        `;
                    }
                }
            }

            const leftVotes = vote.votesA || 0;
            const rightVotes = vote.votesB || 0;
            let leftPercentage = calculatePercentage(leftVotes, rightVotes);
            let rightPercentage = 100 - leftPercentage;
            
            const leftResultClass = leftPercentage > rightPercentage ? 'winning-result' : '';
            const rightResultClass = rightPercentage > leftPercentage ? 'winning-result' : '';
            
            row.innerHTML = `
                <td>
                    <div class="vote-title">${vote.question}</div>
                    <div class="vote-period-admin">${periodDisplay}</div>
                </td>
                <td>${vote.optionA}</td>
                <td>${vote.optionB}</td>
                <td>${vote.registerId || ''}</td>
                <td class="${leftResultClass}">${leftVotes} (${leftPercentage}%)</td>
                <td class="${rightResultClass}">${rightVotes} (${rightPercentage}%)</td>
                <td>
                    ${status}
                    <div class="action-buttons">
                        ${actionButtons}
                    </div>
                </td>
            `;
            
            // 종료된 투표만 클릭 가능하도록 설정
            if (status === '종료됨') {
                row.style.cursor = 'pointer';
                row.onclick = (e) => {
                    if (!e.target.closest('button')) {
                        showVoteDetails(doc.id);
                    }
                };
            }
            
            voteListBody.appendChild(row);
        });
    } catch (error) {
        console.error('Error loading vote list:', error);
    }
}

// 날짜 시간 포맷팅 함수
function formatDateTime(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    
    return `${year}.${month}.${day} ${hours}:${minutes}`;
}

// 투표 여부 확인 함수
function hasVoted(voteId) {
    const votedList = JSON.parse(localStorage.getItem('votedList') || '[]');
    return votedList.includes(voteId);
}

// 투표 기록 저장 함수
function markAsVoted(voteId) {
    const votedList = JSON.parse(localStorage.getItem('votedList') || '[]');
    votedList.push(voteId);
    localStorage.setItem('votedList', JSON.stringify(votedList));
}

// 현재 투표 로드 함수
async function loadCurrentVote() {
    try {
        // 선택 상태 초기화
        selectedOption = null;
        selectedGender = null;
        
        // UI 초기화
        document.querySelectorAll('.vote-circle').forEach(btn => {
            btn.classList.remove('selected');
            btn.disabled = false;
        });
        document.querySelectorAll('.gender-btn').forEach(btn => {
            btn.classList.remove('selected');
            btn.disabled = false;
        });
        const ageSelect = document.getElementById('ageGroup');
        if (ageSelect) {
            ageSelect.value = '';
            ageSelect.disabled = false;
        }
        
        document.querySelector('.submit-btn').disabled = true;
        document.querySelector('.result-graph').classList.add('hidden');
        document.querySelector('.result-graph').classList.remove('show');
        document.querySelector('.vote-options').style.display = 'flex';
        document.querySelector('.user-info-form').style.display = 'block';

        // 이전에 추가된 다음 투표 정보가 있다면 모두 제거
        document.querySelectorAll('.next-vote-info').forEach(el => el.remove());

        const now = new Date();
        const snapshot = await db.collection('votes').get();

        let currentVoteDoc = null;
        let nextVoteDoc = null;
        
        const sortedDocs = snapshot.docs
            .map(doc => ({ id: doc.id, data: doc.data() }))
            .filter(doc => doc.data.status !== 'ended')
            .sort((a, b) => a.data.startTime.toDate() - b.data.startTime.toDate());

        for (const doc of sortedDocs) {
            const data = doc.data;
            
            if (!data.startTime || !data.endTime) {
                console.warn('Vote document missing time fields:', doc.id);
                continue;
            }

            const startTime = data.startTime.toDate();
            const endTime = data.endTime.toDate();
            
            if (now >= startTime && now <= endTime) {
                currentVoteDoc = { id: doc.id, data: data };
                break;
            }
            
            if (now < startTime && !nextVoteDoc) {
                nextVoteDoc = { id: doc.id, data: data };
            }
        }

        if (!currentVoteDoc) {
            document.getElementById('currentQuestion').textContent = '현재 진행중인 투표가 없습니다.';
            document.getElementById('optionAButton').textContent = 'A';
            document.getElementById('optionBButton').textContent = 'B';
            document.getElementById('votePeriod').textContent = '';
            
            document.querySelectorAll('.vote-circle').forEach(btn => {
                btn.disabled = true;
                btn.style.opacity = '0.5';
            });
            document.querySelector('.user-info-form').style.display = 'none';
            document.querySelector('.result-graph').style.display = 'none';
            
            const nextVoteInfo = document.createElement('div');
            nextVoteInfo.className = 'next-vote-info';
            if (nextVoteDoc) {
                const nextStartTime = nextVoteDoc.data.startTime.toDate();
                nextVoteInfo.textContent = `다음 투표 개시: ${formatDateTime(nextStartTime)}`;
            } else {
                nextVoteInfo.textContent = '예정된 다음 투표가 없습니다.';
            }
            
            const previousVotesBtn = document.querySelector('.previous-votes-btn');
            if (previousVotesBtn) {
                previousVotesBtn.parentNode.insertBefore(nextVoteInfo, previousVotesBtn);
            }
            
            currentVoteId = null;
            return;
        }

        const voteData = currentVoteDoc.data;
        currentVoteId = currentVoteDoc.id;

        // 이미 투표했는지 확인
        if (hasVoted(currentVoteId)) {
            // 투표 UI 비활성화
            document.querySelectorAll('.vote-circle').forEach(btn => {
                btn.disabled = true;
                btn.style.opacity = '0.5';
            });
            document.querySelectorAll('.gender-btn').forEach(btn => {
                btn.disabled = true;
            });
            document.getElementById('ageGroup').disabled = true;
            document.querySelector('.submit-btn').disabled = true;
            
            // 결과 그래프 표시
            document.querySelector('.result-graph').classList.remove('hidden');
            setTimeout(() => {
                document.querySelector('.result-graph').classList.add('show');
            }, 100);

            // Hide share buttons after voting
            const shareButtons = document.querySelector('.result-graph .share-buttons');
            if (shareButtons) {
                shareButtons.style.display = 'none';
            }
        }

        // 질문과 투표 옵션 업데이트
        document.getElementById('currentQuestion').textContent = voteData.question;
        document.getElementById('optionAButton').textContent = voteData.optionA;
        document.getElementById('optionBButton').textContent = voteData.optionB;

        // 투표 기간 표시
        const startTime = voteData.startTime.toDate();
        const endTime = voteData.endTime.toDate();
        document.getElementById('votePeriod').textContent = 
            `${formatDateTime(startTime)} ~ ${formatDateTime(endTime)}`;

        // 투표 옵션과 그래프 표시
        document.querySelector('.vote-options').style.display = 'flex';
        document.querySelector('.result-graph').style.display = 'block';

        // 초기 결과 업데이트
        updateResults(voteData.votesA || 0, voteData.votesB || 0);

        // 실시간 업데이트 리스너 설정
        if (currentVoteId) {
            const unsubscribe = db.collection('votes').doc(currentVoteId)
                .onSnapshot((doc) => {
                    if (doc.exists) {
                        const data = doc.data();
                        updateResults(data.votesA || 0, data.votesB || 0);
                    }
                });
            
            return () => unsubscribe();
        }

    } catch (error) {
        console.error('Error loading current vote:', error);
        document.getElementById('currentQuestion').textContent = '투표를 불러오는 중 오류가 발생했습니다.';
        document.querySelector('.vote-options').style.display = 'none';
        document.querySelector('.user-info-form').style.display = 'none';
        document.querySelector('.result-graph').style.display = 'none';
    }
}

// 투표 옵션 선택
function selectOption(option) {
    selectedOption = option;
    document.querySelectorAll('.vote-circle').forEach(btn => {
        btn.classList.remove('selected');
    });
    document.getElementById(`option${option}Button`).classList.add('selected');
    checkSubmitButton();
}

// 성별 선택
function selectGender(gender) {
    selectedGender = gender;
    document.querySelectorAll('.gender-btn').forEach(btn => {
        btn.classList.remove('selected');
    });
    if (gender === '남자') {
        document.getElementById('maleBtn').classList.add('selected');
    } else {
        document.getElementById('femaleBtn').classList.add('selected');
    }
    checkSubmitButton();
}

// 제출 버튼 활성화 체크
function checkSubmitButton() {
    const submitBtn = document.querySelector('.submit-btn');
    const ageGroup = document.getElementById('ageGroup').value;
    submitBtn.disabled = !selectedOption || !selectedGender || !ageGroup;
}

// 투표 제출
async function submitVote() {
    if (!currentVoteId || !selectedOption || !selectedGender) {
        alert('모든 항목을 선택해주세요.');
        return;
    }

    const ageGroup = document.getElementById('ageGroup').value;
    if (!ageGroup) {
        alert('연령대를 선택해주세요.');
        return;
    }

    try {
        const voteRef = db.collection('votes').doc(currentVoteId);
        const statsRef = db.collection('voteStats').doc(currentVoteId);
        
        await db.runTransaction(async (transaction) => {
            const voteDoc = await transaction.get(voteRef);
            const statsDoc = await transaction.get(statsRef);
            
            if (!voteDoc.exists) {
                throw new Error('Vote not found');
            }

            let statsData = statsDoc.exists ? statsDoc.data() : {};
            
            if (!statsData.genderStats) {
                statsData.genderStats = {
                    male: { A: 0, B: 0 },
                    female: { A: 0, B: 0 }
                };
            }
            
            if (!statsData.ageStats) {
                statsData.ageStats = {
                    '10대': { A: 0, B: 0 },
                    '20대': { A: 0, B: 0 },
                    '30대': { A: 0, B: 0 },
                    '40대': { A: 0, B: 0 },
                    '50대': { A: 0, B: 0 },
                    '60대이상': { A: 0, B: 0 }
                };
            }
            
            if (!statsData.detailedStats) {
                statsData.detailedStats = {
                    male: {},
                    female: {}
                };
            }

            const genderKey = selectedGender === '남자' ? 'male' : 'female';
            
            if (!statsData.genderStats[genderKey]) {
                statsData.genderStats[genderKey] = { A: 0, B: 0 };
            }
            statsData.genderStats[genderKey][selectedOption] += 1;
            
            if (!statsData.ageStats[ageGroup]) {
                statsData.ageStats[ageGroup] = { A: 0, B: 0 };
            }
            statsData.ageStats[ageGroup][selectedOption] += 1;
            
            if (!statsData.detailedStats[genderKey][ageGroup]) {
                statsData.detailedStats[genderKey][ageGroup] = { A: 0, B: 0 };
            }
            statsData.detailedStats[genderKey][ageGroup][selectedOption] += 1;

            const updateData = {};
            if (selectedOption === 'A') {
                updateData.votesA = firebase.firestore.FieldValue.increment(1);
            } else {
                updateData.votesB = firebase.firestore.FieldValue.increment(1);
            }

            transaction.update(voteRef, updateData);
            transaction.set(statsRef, statsData);
        });

        // 투표 완료 후 localStorage에 기록
        markAsVoted(currentVoteId);

        // UI 업데이트
        document.querySelector('.result-graph').classList.remove('hidden');
        setTimeout(() => {
            document.querySelector('.result-graph').classList.add('show');
        }, 100);

        // Hide share buttons after voting
        const shareButtons = document.querySelector('.result-graph .share-buttons');
        if (shareButtons) {
            shareButtons.style.display = 'none';
        }

        // 투표 옵션 비활성화
        document.querySelectorAll('.vote-circle').forEach(btn => {
            btn.disabled = true;
            btn.style.opacity = '0.5';
        });
        document.querySelectorAll('.gender-btn').forEach(btn => {
            btn.disabled = true;
        });
        document.getElementById('ageGroup').disabled = true;
        document.querySelector('.submit-btn').disabled = true;

    } catch (error) {
        console.error('Error submitting vote:', error);
        alert('투표 중 오류가 발생했습니다.');
    }
}

// 투표 함수
async function vote(option) {
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

// 투표 종료 함수
async function endVote(voteId) {
    try {
        const now = new Date();
        await db.collection('votes').doc(voteId).update({
            status: 'ended',
            endTime: firebase.firestore.Timestamp.fromDate(now),
            endedAt: firebase.firestore.Timestamp.fromDate(now)
        });
        loadVoteList();
    } catch (error) {
        console.error('Error ending vote:', error);
        alert('투표 종료 중 오류가 발생했습니다');
    }
}

// 결과 업데이트 함수
function updateResults(votesA, votesB) {
    const total = votesA + votesB;
    let percentageA = total === 0 ? 50 : (votesA / total) * 100;
    let percentageB = total === 0 ? 50 : (votesB / total) * 100;

    // 퍼센트 반올림 및 합계 100% 맞추기
    percentageA = Math.round(percentageA);
    percentageB = 100 - percentageA;

    const barA = document.getElementById('barA');
    const barB = document.getElementById('barB');
    
    // 0%/100% 또는 100%/0%일 때, 0% 막대는 색도 표시하지 않음
    if (percentageA === 0 && percentageB === 100) {
        barA.style.width = '0%';
        barA.textContent = '';
        barB.style.width = '100%';
        barB.textContent = '100%';
    } else if (percentageA === 100 && percentageB === 0) {
        barA.style.width = '100%';
        barA.textContent = '100%';
        barB.style.width = '0%';
        barB.textContent = '';
    } else {
        barA.style.width = `${percentageA}%`;
        barB.style.width = `${percentageB}%`;
        barA.textContent = `${percentageA}%`;
        barB.textContent = `${percentageB}%`;
    }

    // 투표 수 표시 제거
    document.getElementById('countA').textContent = '';
    document.getElementById('countB').textContent = '';
}

// 퍼센트 계산 함수
function calculatePercentage(votes, otherVotes) {
    const total = votes + otherVotes;
    if (total === 0) return 0;
    return Math.round((votes / total) * 100);
}

// 이전 투표 보기 함수
async function showPreviousVotes() {
    const modal = document.getElementById('previousVotesModal');
    const tbody = document.getElementById('previousVotesBody');
    tbody.innerHTML = '';
    modal.classList.remove('hidden');

    try {
        const votesRef = db.collection('votes');
        const snapshot = await votesRef
            .orderBy('startTime', 'desc')
            .get();

        const now = new Date();

        snapshot.forEach(doc => {
            const vote = doc.data();
            const exposureTime = vote.startTime.toDate();
            const endTime = vote.endTime.toDate();

            // 종료된 투표만 표시
            if (now > endTime || vote.status === 'ended') {
                const row = document.createElement('tr');
                
                // 투표명
                const titleCell = document.createElement('td');
                titleCell.textContent = vote.question;
                
                // A 항목
                const aItemCell = document.createElement('td');
                aItemCell.textContent = vote.optionA;
                
                // B 항목
                const bItemCell = document.createElement('td');
                bItemCell.textContent = vote.optionB;
                
                // A 결과
                const aResultCell = document.createElement('td');
                const totalVotes = (vote.votesA || 0) + (vote.votesB || 0);
                const aVotes = vote.votesA || 0;
                let aPercentage = totalVotes > 0 ? Math.round((aVotes / totalVotes) * 100) : 0;
                const aText = `${aVotes} (${aPercentage}%)`;
                aResultCell.textContent = aText;
                
                // B 결과
                const bResultCell = document.createElement('td');
                const bVotes = vote.votesB || 0;
                const bPercentage = 100 - aPercentage;
                const bText = `${bVotes} (${bPercentage}%)`;
                bResultCell.textContent = bText;
                
                if (aPercentage > bPercentage) {
                    aResultCell.style.color = '#2196F3';
                } else if (bPercentage > aPercentage) {
                    bResultCell.style.color = '#2196F3';
                }
                
                row.appendChild(titleCell);
                row.appendChild(aItemCell);
                row.appendChild(bItemCell);
                row.appendChild(aResultCell);
                row.appendChild(bResultCell);

                // 행 클릭 이벤트 추가
                row.style.cursor = 'pointer';
                row.onclick = () => {
                    showVoteDetails(doc.id);
                    closePreviousVotes(); // 이전 투표 목록 모달 닫기
                };
                
                tbody.appendChild(row);
            }
        });
    } catch (error) {
        console.error('Error loading previous votes:', error);
        alert('이전 투표 목록을 불러오는 중 오류가 발생했습니다.');
    }
}

// 이전 투표 목록 모달 닫기
function closePreviousVotes() {
    document.getElementById('previousVotesModal').classList.add('hidden');
}

// 투표 상세 정보 표시 함수
async function showVoteDetails(voteId) {
    try {
        // 투표 정보 가져오기
        const voteDoc = await db.collection('votes').doc(voteId).get();
        if (!voteDoc.exists) {
            console.error('Vote not found');
            return;
        }

        const voteData = voteDoc.data();
        
        // 통계 정보 가져오기
        const statsDoc = await db.collection('voteStats').doc(voteId).get();
        const statsData = statsDoc.exists ? statsDoc.data() : {
            genderStats: {
                male: { A: 0, B: 0 },
                female: { A: 0, B: 0 }
            },
            ageStats: {
                '10대': { A: 0, B: 0 },
                '20대': { A: 0, B: 0 },
                '30대': { A: 0, B: 0 },
                '40대': { A: 0, B: 0 },
                '50대': { A: 0, B: 0 },
                '60대이상': { A: 0, B: 0 }
            },
            detailedStats: {
                male: {
                    '10대': { A: 0, B: 0 },
                    '20대': { A: 0, B: 0 },
                    '30대': { A: 0, B: 0 },
                    '40대': { A: 0, B: 0 },
                    '50대': { A: 0, B: 0 },
                    '60대이상': { A: 0, B: 0 }
                },
                female: {
                    '10대': { A: 0, B: 0 },
                    '20대': { A: 0, B: 0 },
                    '30대': { A: 0, B: 0 },
                    '40대': { A: 0, B: 0 },
                    '50대': { A: 0, B: 0 },
                    '60대이상': { A: 0, B: 0 }
                }
            }
        };

        // 제목과 옵션 설정
        document.getElementById('voteDetailTitle').textContent = voteData.question;
        document.getElementById('optionATitle').textContent = voteData.optionA;
        document.getElementById('optionBTitle').textContent = voteData.optionB;

        // 통계 테이블 업데이트
        await updateStatsTable('A', statsData, voteId);
        await updateStatsTable('B', statsData, voteId);

        // 모달 표시
        document.getElementById('voteDetailsModal').classList.remove('hidden');
    } catch (error) {
        console.error('Error loading vote details:', error);
        alert('투표 상세 정보를 불러오는 중 오류가 발생했습니다.');
    }
}

// 통계 테이블 업데이트 함수
async function updateStatsTable(option, statsData, voteId) {
    const maleStats = document.getElementById(`option${option}MaleStats`).children;
    const femaleStats = document.getElementById(`option${option}FemaleStats`).children;
    const ageGroups = ['10대', '20대', '30대', '40대', '50대', '60대이상'];
    
    let maleTotalVotes = 0;
    let femaleTotalVotes = 0;

    // 데이터가 없는 경우 초기화
    if (!statsData.detailedStats) {
        statsData.detailedStats = {
            male: {},
            female: {}
        };
    }

    // 남성 통계
    ageGroups.forEach((age, index) => {
        if (!statsData.detailedStats.male[age]) {
            statsData.detailedStats.male[age] = { A: 0, B: 0 };
        }
        const maleCount = statsData.detailedStats.male[age][option] || 0;
        maleTotalVotes += maleCount;
        maleStats[index].textContent = maleCount;
    });
    maleStats[6].textContent = maleTotalVotes; // 소계

    // 여성 통계
    ageGroups.forEach((age, index) => {
        if (!statsData.detailedStats.female[age]) {
            statsData.detailedStats.female[age] = { A: 0, B: 0 };
        }
        const femaleCount = statsData.detailedStats.female[age][option] || 0;
        femaleTotalVotes += femaleCount;
        femaleStats[index].textContent = femaleCount;
    });
    femaleStats[6].textContent = femaleTotalVotes; // 소계

    // 총계 표시 (성별 통계의 합으로 계산)
    const totalVotes = maleTotalVotes + femaleTotalVotes;
    const optionStats = document.getElementById(`option${option}Title`).parentElement;
    optionStats.querySelector('.vote-count-total').textContent = `총 ${totalVotes}표`;
}

// 투표 상세 정보 모달 닫기
function closeVoteDetails() {
    document.getElementById('voteDetailsModal').classList.add('hidden');
    // 관리자 페이지가 아닌 경우에만 이전 투표 목록 다시 표시
    if (!isAdmin) {
        document.getElementById('previousVotesModal').classList.remove('hidden');
    }
}

// 투표 삭제 함수
async function deleteVote(voteId) {
    if (!confirm('정말 이 투표를 삭제하시겠습니까?')) {
        return;
    }

    try {
        // 투표 문서 삭제
        await db.collection('votes').doc(voteId).delete();
        // 관련 통계 데이터 삭제
        await db.collection('voteStats').doc(voteId).delete();
        
        alert('투표가 삭제되었습니다.');
        loadVoteList(); // 목록 새로고침
    } catch (error) {
        console.error('Error deleting vote:', error);
        alert('투표 삭제 중 오류가 발생했습니다.');
    }
}

// 투표 수정 함수
async function editVote(voteId) {
    try {
        const voteDoc = await db.collection('votes').doc(voteId).get();
        if (!voteDoc.exists) {
            alert('투표를 찾을 수 없습니다.');
            return;
        }

        const vote = voteDoc.data();
        
        // 폼에 기존 데이터 설정
        document.getElementById('question').value = vote.question;
        document.getElementById('optionA').value = vote.optionA;
        document.getElementById('optionB').value = vote.optionB;
        
        // 신청 상태인 경우에만 시작/종료 시간 초기화
        if (vote.status === '신청') {
            document.getElementById('startTime').value = '';
            document.getElementById('endTime').value = '';
        } else {
            document.getElementById('startTime').value = formatDateTimeForInput(vote.startTime.toDate());
            document.getElementById('endTime').value = formatDateTimeForInput(vote.endTime.toDate());
        }
        
        // 저장 버튼의 동작을 수정 모드로 변경
        const saveButton = document.querySelector('.vote-form button');
        saveButton.textContent = '수정';
        saveButton.onclick = () => updateVote(voteId, vote.status === '신청');
    } catch (error) {
        console.error('Error loading vote for edit:', error);
        alert('투표 정보를 불러오는 중 오류가 발생했습니다.');
    }
}

// input type="datetime-local"용 날짜 포맷팅 함수
function formatDateTimeForInput(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    
    return `${year}-${month}-${day}T${hours}:${minutes}`;
}

// 투표 업데이트 함수
async function updateVote(voteId, isRequest) {
    const question = document.getElementById('question').value;
    const optionA = document.getElementById('optionA').value;
    const optionB = document.getElementById('optionB').value;
    const startTime = document.getElementById('startTime').value;
    const endTime = document.getElementById('endTime').value;

    if (!question || !optionA || !optionB) {
        alert('투표 제목과 옵션을 입력해주세요');
        return;
    }

    // 기본 업데이트 데이터
    const updateData = {
        question,
        optionA,
        optionB,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    };

    // 신청 상태에서 노출 기간을 설정하는 경우
    if (isRequest && startTime && endTime) {
        const start = new Date(startTime);
        const end = new Date(endTime);

        if (end <= start) {
            alert('마감일시는 시작일시보다 늦어야 합니다');
            return;
        }

        try {
            // 다른 투표와의 기간 중복 체크
            const overlapCheck = await checkPeriodOverlap(startTime, endTime, voteId);
            if (overlapCheck.overlap) {
                alert(`다음 기간과 중복됩니다:\n${overlapCheck.existingVote.start} ~ ${overlapCheck.existingVote.end}`);
                return;
            }

            // 노출 기간 설정 시 상태를 '대기중'으로 변경
            updateData.startTime = firebase.firestore.Timestamp.fromDate(start);
            updateData.endTime = firebase.firestore.Timestamp.fromDate(end);
            updateData.status = 'waiting';
        } catch (error) {
            console.error('Error checking period overlap:', error);
            alert('기간 중복 확인 중 오류가 발생했습니다');
            return;
        }
    } else if (!isRequest && (!startTime || !endTime)) {
        alert('노출 기간을 설정해주세요');
        return;
    }

    try {
        await db.collection('votes').doc(voteId).update(updateData);

        // 폼 초기화 및 버튼 상태 복구
        clearAdminForm();
        const saveButton = document.querySelector('.vote-form button');
        saveButton.textContent = '저장';
        saveButton.onclick = saveVote;

        alert('투표가 수정되었습니다.');
        loadVoteList();
    } catch (error) {
        console.error('Error updating vote:', error);
        alert('투표 수정 중 오류가 발생했습니다');
    }
}

// 향후 투표 일정 표시 함수
async function showUpcomingVotes() {
    const modal = document.getElementById('upcomingVotesModal');
    const tbody = document.getElementById('upcomingVotesList');
    tbody.innerHTML = '';
    modal.classList.remove('hidden');

    try {
        const now = new Date();
        const votesRef = db.collection('votes');
        const snapshot = await votesRef
            .orderBy('startTime', 'asc')
            .get();

        let hasUpcomingVotes = false;

        snapshot.forEach(doc => {
            const vote = doc.data();
            const startTime = vote.startTime.toDate();
            
            // 시작 시간이 현재보다 미래이고 종료되지 않은 투표만 표시
            if (startTime > now && vote.status !== 'ended') {
                hasUpcomingVotes = true;
                const row = document.createElement('tr');
                
                // 투표명
                const titleCell = document.createElement('td');
                titleCell.textContent = vote.question;
                
                // 투표기간
                const periodCell = document.createElement('td');
                periodCell.innerHTML = `${formatDateTime(startTime)}<br>~ ${formatDateTime(vote.endTime.toDate())}`;
                
                // A 옵션
                const optionACell = document.createElement('td');
                optionACell.textContent = vote.optionA;
                
                // B 옵션
                const optionBCell = document.createElement('td');
                optionBCell.textContent = vote.optionB;
                
                row.appendChild(titleCell);
                row.appendChild(periodCell);
                row.appendChild(optionACell);
                row.appendChild(optionBCell);
                
                tbody.appendChild(row);
            }
        });

        if (!hasUpcomingVotes) {
            const row = document.createElement('tr');
            const cell = document.createElement('td');
            cell.colSpan = 4;
            cell.className = 'no-upcoming-votes';
            cell.textContent = '예정된 투표가 없습니다.';
            row.appendChild(cell);
            tbody.appendChild(row);
        }
    } catch (error) {
        console.error('Error loading upcoming votes:', error);
        alert('향후 투표 일정을 불러오는 중 오류가 발생했습니다.');
    }
}

// 향후 투표 일정 모달 닫기
function closeUpcomingVotes() {
    document.getElementById('upcomingVotesModal').classList.add('hidden');
}

// 투표 신청 모달 표시
function showVoteRequest() {
    const modal = document.getElementById('voteRequestModal');
    if (modal) {
        modal.classList.remove('hidden');
        modal.style.display = 'flex';
    }
}

// 투표 신청 모달 닫기
function closeVoteRequest() {
    const modal = document.getElementById('voteRequestModal');
    if (modal) {
        modal.classList.add('hidden');
        modal.style.display = 'none';
        var voteRequestForm = document.getElementById('voteRequestForm');
        if (voteRequestForm) {
            voteRequestForm.reset();
        }
    }
}

// KakaoTalk Share
function shareKakao() {
    // Check if Kakao SDK is loaded
    if (typeof Kakao === 'undefined') {
        alert('카카오톡 공유 기능을 사용할 수 없습니다.');
        return;
    }

    Kakao.Link.sendDefault({
        objectType: 'feed',
        content: {
            title: '투표해주세요!',
            description: '당신의 선택은?',
            imageUrl: 'YOUR_IMAGE_URL', // Replace with your image URL
            link: {
                mobileWebUrl: window.location.href,
                webUrl: window.location.href,
            },
        },
        buttons: [
            {
                title: '투표하러 가기',
                link: {
                    mobileWebUrl: window.location.href,
                    webUrl: window.location.href,
                },
            },
        ],
    });
}

// Facebook Share
function shareFacebook() {
    const url = encodeURIComponent(window.location.href);
    window.open(`https://www.facebook.com/sharer/sharer.php?u=${url}`, '_blank');
}

// Twitter/X Share
function shareTwitter() {
    const text = encodeURIComponent('투표해주세요!');
    const url = encodeURIComponent(window.location.href);
    window.open(`https://twitter.com/intent/tweet?text=${text}&url=${url}`, '_blank');
}

// Instagram Share (Note: Direct sharing to Instagram feed is not possible via web API)
function shareInstagram() {
    alert('Instagram 공유는 모바일 앱에서만 가능합니다.');
}
