# Установка TikTok Monitor на Ubuntu 24.04 VDS

## 1. Подготовка сервера

```bash
# Обновление системы
sudo apt update && sudo apt upgrade -y

# Установка необходимых пакетов
sudo apt install -y curl git
```

## 2. Установка Node.js 20

```bash
# Добавление NodeSource репозитория
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -

# Установка Node.js
sudo apt install -y nodejs

# Проверка версии
node --version
npm --version
```

## 3. Создание пользователя для приложения

```bash
# Создание пользователя
sudo useradd -m -s /bin/bash tiktok

# Переключение на пользователя
sudo su - tiktok
```

## 4. Клонирование и настройка проекта

```bash
# Клонирование репозитория
git clone https://github.com/ruenh/tiktok-monitor.git ~/tiktok-monitor
cd ~/tiktok-monitor

# Установка зависимостей для бэкенда
npm install

# Установка зависимостей для веб-интерфейса
cd web
npm install
cd ..

# Сборка всего проекта (бэкенд + фронтенд)
npm run build:all
```

## 5. Конфигурация

```bash
# Создание конфигурационного файла
cat > config.json << 'EOF'
{
  "webhookUrl": "https://n8n.odindindindun.ru/webhook/tiktok-new-video",
  "pollingInterval": 300,
  "authors": [],
  "maxRetries": 3
}
EOF
```

## 6. Настройка systemd сервиса (CLI режим)

Для запуска только мониторинга без веб-интерфейса:

```bash
# Выход из пользователя tiktok
exit

# Создание systemd unit файла
sudo tee /etc/systemd/system/tiktok-monitor.service << 'EOF'
[Unit]
Description=TikTok Monitor Service
After=network.target

[Service]
Type=simple
User=tiktok
WorkingDirectory=/home/tiktok/tiktok-monitor
ExecStart=/usr/bin/node dist/index.js start
Restart=always
RestartSec=10
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
EOF

# Перезагрузка systemd
sudo systemctl daemon-reload

# Включение автозапуска
sudo systemctl enable tiktok-monitor

# Запуск сервиса
sudo systemctl start tiktok-monitor

# Проверка статуса
sudo systemctl status tiktok-monitor
```

## 6.1 Настройка systemd сервиса (Web UI режим)

Для запуска с веб-интерфейсом:

```bash
# Выход из пользователя tiktok
exit

# Создание systemd unit файла для Web UI
sudo tee /etc/systemd/system/tiktok-monitor-web.service << 'EOF'
[Unit]
Description=TikTok Monitor Web UI Service
After=network.target

[Service]
Type=simple
User=tiktok
WorkingDirectory=/home/tiktok/tiktok-monitor
ExecStart=/usr/bin/node dist/index.js web
Restart=always
RestartSec=10
Environment=NODE_ENV=production
Environment=PORT=3000

[Install]
WantedBy=multi-user.target
EOF

# Перезагрузка systemd
sudo systemctl daemon-reload

# Включение автозапуска
sudo systemctl enable tiktok-monitor-web

# Запуск сервиса
sudo systemctl start tiktok-monitor-web

# Проверка статуса
sudo systemctl status tiktok-monitor-web
```

## 7. Управление сервисом

```bash
# Просмотр логов
sudo journalctl -u tiktok-monitor -f

# Перезапуск
sudo systemctl restart tiktok-monitor

# Остановка
sudo systemctl stop tiktok-monitor
```

## 8. Добавление авторов для мониторинга

```bash
# Переключение на пользователя tiktok
sudo su - tiktok
cd ~/tiktok-monitor

# Добавление автора
node dist/index.js add-author username1

# Просмотр списка авторов
node dist/index.js list-authors

# Просмотр статуса
node dist/index.js status
```

## 9. Настройка n8n Webhook

В n8n создайте новый workflow:

1. Добавьте ноду **Webhook**
2. Установите метод: `POST`
3. Путь: `tiktok-new-video`
4. Полный URL будет: `https://n8n.odindindindun.ru/webhook/tiktok-new-video`

Входящие данные будут содержать:

```json
{
  "videoId": "7123456789",
  "videoUrl": "https://www.tiktok.com/@author/video/7123456789",
  "description": "Описание видео",
  "author": "username",
  "publishedAt": "2025-12-08T10:00:00Z"
}
```

## 10. Проверка работы

```bash
# Просмотр истории обработанных видео
sudo su - tiktok
cd ~/tiktok-monitor
node dist/index.js history

# Просмотр логов в реальном времени
sudo journalctl -u tiktok-monitor -f
```

## 11. Настройка Nginx для домена tiktok.odindindindun.ru

```bash
# Установка Nginx
sudo apt install -y nginx

# Установка Certbot для SSL
sudo apt install -y certbot python3-certbot-nginx

# Создание конфигурации Nginx
sudo tee /etc/nginx/sites-available/tiktok-monitor << 'EOF'
server {
    listen 80;
    server_name tiktok.odindindindun.ru;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
EOF

# Активация конфигурации
sudo ln -sf /etc/nginx/sites-available/tiktok-monitor /etc/nginx/sites-enabled/

# Проверка конфигурации
sudo nginx -t

# Перезапуск Nginx
sudo systemctl restart nginx

# Получение SSL сертификата
sudo certbot --nginx -d tiktok.odindindindun.ru
```

После получения SSL сертификата Certbot автоматически обновит конфигурацию Nginx для HTTPS.

## 12. Проверка работы Web UI

```bash
# Проверка статуса сервиса
sudo systemctl status tiktok-monitor-web

# Просмотр логов
sudo journalctl -u tiktok-monitor-web -f

# Открыть в браузере
# https://tiktok.odindindindun.ru
```

## Полезные команды

| Команда                                           | Описание                    |
| ------------------------------------------------- | --------------------------- |
| `node dist/index.js start`                        | Запуск мониторинга (CLI)    |
| `node dist/index.js web`                          | Запуск с Web UI             |
| `node dist/index.js stop`                         | Остановка                   |
| `node dist/index.js add-author <username>`        | Добавить автора             |
| `node dist/index.js remove-author <username>`     | Удалить автора              |
| `node dist/index.js list-authors`                 | Список авторов              |
| `node dist/index.js status`                       | Статус системы              |
| `node dist/index.js history`                      | История видео               |
| `node dist/index.js config webhookUrl <url>`      | Изменить webhook URL        |
| `node dist/index.js config pollingInterval <sec>` | Изменить интервал (60-3600) |

## npm скрипты

| Команда             | Описание                 |
| ------------------- | ------------------------ |
| `npm run build`     | Сборка бэкенда           |
| `npm run build:web` | Сборка фронтенда         |
| `npm run build:all` | Сборка всего проекта     |
| `npm run start`     | Запуск мониторинга (CLI) |
| `npm run start:web` | Запуск с Web UI          |
| `npm run dev`       | Разработка (CLI)         |
| `npm run dev:web`   | Разработка с Web UI      |
| `npm test`          | Запуск тестов            |
