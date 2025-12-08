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
# Клонирование репозитория (замените URL на ваш)
git clone <your-repo-url> ~/tiktok-monitor
cd ~/tiktok-monitor

# Установка зависимостей
npm install

# Сборка проекта
npm run build
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

## 6. Настройка systemd сервиса

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

## Полезные команды

| Команда                                           | Описание                    |
| ------------------------------------------------- | --------------------------- |
| `node dist/index.js start`                        | Запуск мониторинга          |
| `node dist/index.js stop`                         | Остановка                   |
| `node dist/index.js add-author <username>`        | Добавить автора             |
| `node dist/index.js remove-author <username>`     | Удалить автора              |
| `node dist/index.js list-authors`                 | Список авторов              |
| `node dist/index.js status`                       | Статус системы              |
| `node dist/index.js history`                      | История видео               |
| `node dist/index.js config webhookUrl <url>`      | Изменить webhook URL        |
| `node dist/index.js config pollingInterval <sec>` | Изменить интервал (60-3600) |
