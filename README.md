# TikTok Monitor

Система мониторинга TikTok авторов с автоматической отправкой данных о новых видео в n8n webhook.

## Возможности

- Мониторинг нескольких TikTok авторов
- Автоматическое определение новых видео
- Отправка данных в n8n webhook для автоматизации
- Персистентное хранение состояния (переживает перезапуски)
- CLI интерфейс для управления

## Быстрый старт

```bash
# Установка зависимостей
npm install

# Сборка
npm run build

# Настройка webhook URL
node dist/index.js config webhookUrl https://your-n8n.com/webhook/tiktok

# Добавление автора для мониторинга
node dist/index.js add-author tiktok_username

# Запуск мониторинга
node dist/index.js start
```

## CLI команды

| Команда                    | Описание                        |
| -------------------------- | ------------------------------- |
| `start`                    | Запуск мониторинга              |
| `stop`                     | Остановка                       |
| `add-author <username>`    | Добавить автора                 |
| `remove-author <username>` | Удалить автора                  |
| `list-authors`             | Список авторов                  |
| `status`                   | Статус системы                  |
| `history [limit]`          | История обработанных видео      |
| `config <key> [value]`     | Просмотр/изменение конфигурации |

## Конфигурация

Файл `config.json` создаётся автоматически:

```json
{
  "webhookUrl": "https://n8n.example.com/webhook/tiktok",
  "pollingInterval": 300,
  "authors": ["author1", "author2"],
  "maxRetries": 3
}
```

- `webhookUrl` - URL n8n webhook
- `pollingInterval` - интервал проверки в секундах (60-3600)
- `authors` - список отслеживаемых авторов
- `maxRetries` - количество повторных попыток при ошибке webhook

## Webhook payload

При обнаружении нового видео отправляется POST запрос:

```json
{
  "videoId": "7123456789",
  "videoUrl": "https://www.tiktok.com/@author/video/7123456789",
  "description": "Описание видео",
  "author": "username",
  "publishedAt": "2025-12-08T10:00:00Z"
}
```

## Установка на сервер

См. [INSTALL.md](INSTALL.md) для подробной инструкции по установке на Ubuntu 24.04 VDS.

## Разработка

```bash
# Запуск тестов
npm test

# Запуск в dev режиме
npm run dev
```
