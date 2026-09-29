import os
from flask import Flask, render_template, request
from flask_socketio import SocketIO, emit, join_room
from datetime import datetime

app = Flask(__name__)
app.config['SECRET_KEY'] = 'secret-key-change-me'

# حداکثر حجم پیام (برای فایل و ویس) = 50 مگابایت
socketio = SocketIO(
    app,
    cors_allowed_origins='*',
    max_http_buffer_size=50 * 1024 * 1024,
    async_mode='threading'
)

users = {}      # sid -> {"name": str}
messages = []   # آخرین 100 پیام

def now_time():
    return datetime.now().strftime('%H:%M')

@app.route('/')
def index():
    return render_template('index.html')

# ---------- اتصال / قطع ----------
@socketio.on('join')
def on_join(data):
    sid = request.sid
    name = (data.get('name') or 'کاربر').strip()[:24]
    users[sid] = {'name': name, 'id': sid}
    join_room('public')

    # ارسال تاریخچه به کاربر جدید
    emit('history', messages, to=sid)

    # اطلاع به بقیه
    emit('user_joined',
         {'id': sid, 'name': name, 'time': now_time()},
         to='public', include_self=False)

    # به‌روزرسانی لیست کاربران برای همه
    emit('users_list', list(users.values()), to='public')

@socketio.on('disconnect')
def on_disconnect():
    sid = request.sid
    if sid in users:
        name = users[sid]['name']
        del users[sid]
        emit('user_left',
             {'id': sid, 'name': name, 'time': now_time()},
             to='public')
        emit('users_list', list(users.values()), to='public')

# ---------- پیام‌ها ----------
def store(msg):
    messages.append(msg)
    if len(messages) > 100:
        messages.pop(0)

@socketio.on('message')
def on_message(data):
    sid = request.sid
    if sid not in users:
        return
    msg = {
        'type': 'text',
        'id': sid,
        'name': users[sid]['name'],
        'text': (data.get('text') or '')[:2000],
        'time': now_time()
    }
    store(msg)
    emit('message', msg, to='public')

@socketio.on('file')
def on_file(data):
    sid = request.sid
    if sid not in users:
        return
    msg = {
        'type': 'file',
        'id': sid,
        'name': users[sid]['name'],
        'filename': data.get('filename', 'file'),
        'filetype': data.get('filetype', ''),
        'data': data.get('data', ''),   # base64
        'time': now_time()
    }
    store(msg)
    emit('message', msg, to='public')

@socketio.on('voice')
def on_voice(data):
    sid = request.sid
    if sid not in users:
        return
    msg = {
        'type': 'voice',
        'id': sid,
        'name': users[sid]['name'],
        'data': data.get('data', ''),          # base64 audio
        'duration': data.get('duration', 0),
        'time': now_time()
    }
    store(msg)
    emit('message', msg, to='public')

# ---------- WebRTC Signaling ----------
@socketio.on('call_user')
def call_user(data):
    target = data.get('to')
    if target in users and request.sid in users:
        emit('incoming_call', {
            'from': request.sid,
            'name': users[request.sid]['name']
        }, to=target)

@socketio.on('accept_call')
def accept_call(data):
    target = data.get('to')
    if target in users:
        emit('call_accepted', {'from': request.sid}, to=target)

@socketio.on('reject_call')
def reject_call(data):
    target = data.get('to')
    if target in users:
        emit('call_rejected', {'from': request.sid}, to=target)

@socketio.on('end_call')
def end_call(data):
    target = data.get('to')
    if target in users:
        emit('call_ended', {'from': request.sid}, to=target)

@socketio.on('webrtc_offer')
def webrtc_offer(data):
    target = data.get('to')
    if target in users:
        emit('webrtc_offer',
             {'from': request.sid, 'sdp': data.get('sdp')}, to=target)

@socketio.on('webrtc_answer')
def webrtc_answer(data):
    target = data.get('to')
    if target in users:
        emit('webrtc_answer',
             {'from': request.sid, 'sdp': data.get('sdp')}, to=target)

@socketio.on('webrtc_ice')
def webrtc_ice(data):
    target = data.get('to')
    if target in users:
        emit('webrtc_ice',
             {'from': request.sid, 'candidate': data.get('candidate')}, to=target)

if __name__ == '__main__':
    socketio.run(app, host='0.0.0.0', port=5000, allow_unsafe_werkzeug=True)
