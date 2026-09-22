# Проверка версии 0.1.1

Исследование от 2026-09-22: [перепутанные иконки после перезагрузки IDE](icon-layout-investigation.md). Ошибка восстановления раскладки воспроизведена на методах из локальных поставок 9.1.9 и 9.2.4; удалённая IDE не менялась.

## Toolbar и переименование, 2026-09-22

Версия 0.1.1: действия toolbar перенесены вправо, внутренний «Новый Bash» удалён, рядом со списком добавлено переименование сессии. Кнопка создания в шапке IDE и пустом состоянии сохранена. Опубликованный архив 0.1.0 не перезапаковывался.

- `npm run check` и `npm run build` — успешно, API baseline остаётся 1.97.0.
- `npm test` — 14 тестов прошли. Новый сценарий проверяет переименование второй сессии без изменения первой и PID, ввод в прежний PTY после переименования, повторную отправку состояния, отмену, недопустимые имена и закрытие сессии во время ввода названия.
- `npm run test:ui` — успешно: реальный Bash через public API harness, создание командой шапки, переименование, переключение сессий, вывод и очистка, ошибки и закрытие. Проверены светлая/тёмная темы, ширины 320/361/600/1100px, длинное имя, положение правой группы и Tab к переименованию. Сетевых запросов и ошибок страницы нет.
- Ручной просмотр снимков `.test-output/terminal-dark.png`, `terminal-narrow.png`, `empty-light.png` и механическая проверка Impeccable: замечаний нет.

Нативное поле `showInputBox` в harness заменено ответом теста. Поведение этой итерации в реальной IDE Элемента пока не проверено; следующий шаг на стенде — переименовать сессию, переключить её и подтвердить работу кнопки создания в шапке. Версии server/IDE/Theia/Node на стенде не измерялись. PTY-бинарники, разрешения хоста и `xbsl`-декларация не менялись.

## Проверка поставки 0.1.1

Архив `release/1c-xbsl-terminal-0.1.1-universal.zip` собирается через `npm run package`. Проверка включает обязательные файлы `xbsl` v1, размеры и SHA-256 всех шести PTY, отсутствие LFS-поинтеров и внешних runtime-импортов. Декларация совместимости — `vscode-api-only`, `engines.vscode: ^1.97.0`, Node >=18.17.

Команды проверки готовой поставки:

```sh
node --import tsx scripts/check-package.ts
node --import tsx scripts/check-portal.ts ../xbsl-io/backend release/1c-xbsl-terminal-0.1.1-universal.zip
```

Первая команда запускает и завершает реальный Bash из собранного каталога. Вторая читает архив локальным валидатором backend XBSL.IO без HTTP, БД и публикации. Полнота архива не подтверждает работу на непроверенных ОС и сборках Элемента.

## Исходная проверка релиза 0.1.0

Дата: 2026-09-21. Базовый коммит репозитория: `8f77f19dcbfe9bd61d7a0b68b7276d1dca4067b1`. Изменения версии 0.1.0 собраны в коммите `Add cross-platform Bash terminal plugin 0.1.0` в Git-истории проекта.

## Выполнено локально

| Проверка | Результат |
| --- | --- |
| `npm run check` | TypeScript, в том числе `@types/vscode@1.97.0` |
| `npm run build` | CJS Node extension, отдельный bundle xterm + addon-fit и CSS |
| `npm test` | 13 тестов: реальный PTY, размер, UTF-8, цвета, cwd, Tab, история, Ctrl+C, exit code, EOF/dispose, независимые сессии, hash/size, ошибки Bash, ввод и flow control; public API harness без автозапуска |
| `npm run test:ui` | Chrome + скомпилированный extension + реальный Bash: две сессии, ввод, переключение, clear/close, ошибка настройки, темы и ширина 320px; сетевых запросов и JS-ошибок нет |
| `npm run build:helpers` | Шесть бинарников Go 1.26.5; `CGO_ENABLED=0`; SHA-256 и размер в `bin/runtime.json` |
| `npm run check:element -- <путь к поставке>` | Статический анализ поставки 9.2.4-6, см. ниже |
| `npm run package` | Готовый каталог, ZIP и SHA-256; обязательные файлы, лицензии и контрольные суммы PTY |
| `tsx scripts/check-portal.ts <backend> <zip>` | Read-only валидатор исходников XBSL.IO: `findings=[]`, `packageCompleteness=verified`, `lfsPointers=none`, `blockers=[]` |
| `node --import tsx scripts/check-package.ts` (Node 22.13.1) | Запуск и завершение реального Bash из готового каталога; runtime-импорты только встроенные Node и `vscode` |

Все 13 автоматических тестов также прошли под Node **22.13.1** на macOS arm64. Проверка UI включала настоящий отказ запуска shell, переход к исправной сессии и закрытие ошибочной. Итог UI review: `ship`; замечания о контрасте ANSI и сохранении ошибки другой сессии устранены. Снимки локального harness лежат в `.test-output/` и не выдают себя за скриншоты Элемента.

Нативная платформа автоматических тестов: macOS arm64. Кросс-компиляция не подтверждает нативную работу Linux x64/arm64, Windows x64/arm64 и macOS x64. Браузерный harness проверяет собственный интерфейс и обмен с extension, но не жизненный цикл Webview внутри Элемента.

## Проверка поставки Элемента

Прочитана локальная поставка `server-package-with-ide-9.2.4-6`, без запуска и изменения её файлов. Относительные пути внутри поставки:

- `ide/theia/products/browser-app/lib/backend/plugin-vscode-init.js`: default VS Code API **1.97.2**. Переменная `VSCODE_API_VERSION` может переопределить это значение; это статическая исходная настройка, не runtime probe.
- `ide/theia/products/browser-app/package.json`: Theia **1.59.110**, IDE package **9.2.4-1**. Имя серверной поставки **9.2.4-6** не подставляется вместо версии IDE.
- `ide/theia/products/browser-app/lib/backend/138.js`: публичные `registerWebviewViewProvider`, `showInputBox`, `getConfiguration`.
- `ide/theia/products/browser-app/lib/backend/357.js`: преобразование расположения `panel` → `bottom` для contributed view containers.
- `ide/theia/products/browser-app/lib/frontend/bundle.js`: регистрация стандартной команды `${viewId}.focus` через `openView(..., {activate: true})`, которую использует команда открытия плагина.
- `ide/theia/products/browser-app/lib/backend/main.js`: ограничение `Terminal processes are prohibited` при отсутствии executor/разрешённого режима. Самостоятельный PTY выбран владельцем; plugin не вызывает этот штатный terminal service.

Манифест использует `main`, `extensionKind: workspace`, отдельные activation events и `engines.vscode: ^1.97.0`. Частные API и модификации host отсутствуют. Node >=18.17 указан отдельно. Фактические runtime-версии и полномочия текущего пользователя на сервере не измерялись.

Источники правил: `theia-plugin-qc/ai-contract/element-plugin-contract.md`, `RnD/CODEX-ELEMENT-V1/local-codex-plugin-1.0.0-rc/docs/reviews/2026-09-08-element-bundle-feasibility.md`, `xbsl-io/backend/docs/plugin-publisher-manifest-v1.md` в соседних каталогах рабочего пространства владельца. Поля `xbsl` соответствуют publisher v1; потребительский API marketplace плагину терминала не нужен.

## Следующая проверка на стенде

Администратор переносит пакет на согласованный сервер и перезагружает IDE workspace. Нужно подтвердить нижнюю вкладку, открытие из палитры, ввод/вставку, Tab/историю, Ctrl+C, resize, полноэкранный CLI, переключение workspace, hide/show и закрытие IDE. На Windows проверить Git Bash и работу ConPTY/Job Object под реальной учётной записью сервиса. На Linux проверить доступ к `/dev/ptmx`. Проверить, что другой workspace/пользователь не видит сессии текущего.

Проверка не включала установку на реальный Элемент и загрузку на XBSL.IO. Успешная проверка архива не заменяет этот стендовый прогон. Для ручной публикации используйте ZIP из каталога `release/` и платформу `universal`.

## Первичные технические источники

- [VS Code API](https://code.visualstudio.com/api/references/vscode-api): публичный контракт extension/webview.
- [Microsoft CreatePseudoConsole](https://learn.microsoft.com/en-us/windows/console/createpseudoconsole): минимум Windows 10 1809 / Server 2019.
- [Go minimum requirements](https://go.dev/wiki/MinimumRequirements): для Go 1.26 Linux kernel 3.2+, macOS 12+, Windows 10+; ConPTY задаёт более высокий минимум для Windows Server.
- [xterm.js security](https://xtermjs.org/docs/guides/security/): граница вывода терминала и приложения.
- [creack/pty](https://github.com/creack/pty), [conpty](https://github.com/UserExistsError/conpty): реализация PTY на целевых ОС.
