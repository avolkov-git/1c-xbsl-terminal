---
name: "1C XBSL Terminal"
description: "Нативная панель Bash в стиле терминала VS Code"
colors:
  terminal-background: "var(--vscode-terminal-background, var(--vscode-panel-background, #1e1e1e))"
  terminal-foreground: "var(--vscode-terminal-foreground, var(--vscode-foreground, #ccc))"
  description: "var(--vscode-descriptionForeground, #aaa)"
  panel-border: "var(--vscode-panel-border, #333)"
  dropdown-background: "var(--vscode-dropdown-background, #313131)"
  toolbar-hover: "var(--vscode-toolbar-hoverBackground, #ffffff15)"
  focus: "var(--vscode-focusBorder, #007fd4)"
  primary: "var(--vscode-button-background, #007acc)"
  primary-text: "var(--vscode-button-foreground, #fff)"
  primary-hover: "var(--vscode-button-hoverBackground, #0062a3)"
  notice-background: "var(--vscode-inputValidation-warningBackground, #352a05)"
  notice-border: "var(--vscode-inputValidation-warningBorder, #b89500)"
  notice-text: "var(--vscode-foreground, #ccc)"
typography:
  body:
    fontFamily: "var(--vscode-font-family, system-ui, sans-serif)"
    fontSize: "var(--vscode-font-size, 13px)"
  label:
    fontSize: "11px"
  title:
    fontSize: "15px"
    fontWeight: 500
  support:
    fontSize: "12px"
    lineHeight: 1.5
  terminal:
    fontFamily: 'var(--vscode-editor-font-family, Consolas, "Liberation Mono", monospace)'
    fontSize: "13px"
rounded:
  control: "2px"
  icon: "3px"
spacing:
  action-gap: "2px"
  toolbar-inset: "8px"
  terminal-inset: "10px"
  empty-inset: "16px"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.primary-text}"
    rounded: "{rounded.control}"
    padding: "5px 13px"
  button-primary-hover:
    backgroundColor: "{colors.primary-hover}"
  button-icon:
    backgroundColor: "transparent"
    textColor: "{colors.terminal-foreground}"
    rounded: "{rounded.icon}"
    width: "28px"
    height: "28px"
    padding: "5px"
  session-select:
    backgroundColor: "{colors.dropdown-background}"
    textColor: "{colors.terminal-foreground}"
    rounded: "{rounded.control}"
    width: "100%"
    height: "26px"
    padding: "2px 5px"
  notice:
    backgroundColor: "{colors.notice-background}"
    textColor: "{colors.notice-text}"
    padding: "8px 12px"
  workspace-footer:
    textColor: "{colors.description}"
    height: "24px"
    padding: "4px 10px"
---

# Design System: 1C XBSL Terminal

## Overview

**Creative North Star: "Терминал VS Code рядом с кодом"**

Терминал продолжает интерфейс IDE: компактные элементы управления, цвета текущей темы и моноширинный вывод. Выбранный владельцем ориентир — терминал VS Code; отдельная декоративная идентичность здесь не вводится.

Основное место занимает работа с Bash. Нет теней, декоративных изображений или переходов; мигание курсора включено штатной настройкой xterm.

**Key Characteristics:**

- Цвета и шрифты из темы host.
- Компактные действия с русскими доступными именами.
- Постоянная область терминала и видимый каталог сессии.

Зафиксировано 2026-09-21 по рабочему дереву: [разметка](src/webview.ts),
[CSS](ui/terminal.css), [поведение](ui/terminal.ts), [ограничения](PRODUCT.md).
Сверены снимки `.test-output/terminal-light.png` и `terminal-narrow.png`.
Это браузерный harness. Нижняя панель подтверждена манифестом и статическим
анализом Элемента; нативный запуск в IDE ещё не проверен —
[границы проверки](docs/verification.md).

## Colors

Палитра следует теме IDE. Frontmatter содержит реальные CSS-привязки;
fallback-цвета не задают отдельную бренд-палитру.

- **Primary:** фон, текст и наведение основной кнопки — токены `button.*`.
- **Neutral:** фон и вывод — `terminal.*` с переходом к `panel.background`
  и `foreground`; подписи — `descriptionForeground`. Разделители, список
  и наведение иконок используют собственные токены host.
- **Состояния:** фокус — `focusBorder`, полоса сообщения —
  `inputValidation.warning*`. Ошибка сейчас показана предупреждающей полосой.
- xterm читает 16 ANSI-цветов, цвет курсора и выделения из темы. Изменение
  класса или inline-стиля `body` обновляет все сессии. Для фона, текста
  и курсора xterm есть светлые и тёмные fallback-значения.
  `minimumContrastRatio: 4.5` задан в xterm; это не аудит всей палитры host.

## Typography

Управление использует UI-шрифт IDE; служебные подписи меньше основного текста.
Заголовок есть только в пустом состоянии. Размеры ролей заданы в frontmatter.
Терминал использует семейство шрифта редактора с моноширинным fallback;
размер xterm фиксирован, настройка размера шрифта редактора не считывается.

## Layout

Вертикальная структура: toolbar (36px), необязательное сообщение,
растягивающийся терминал и footer высотой из frontmatter. `min-height: 0`
позволяет сжимать рабочую область; FitAddon и ResizeObserver подгоняют xterm.

Боковые отступы toolbar и промежуток групп — 8px; список сессий занимает
50–180px. Четыре действия собраны с малым промежутком. До ширины 360px
статус скрывается, промежуток групп сокращается до 4px. Все действия
доступны в проверенном узком виде (320px).

Терминал отступает сверху на 8px, по бокам на 10px. Длинный каталог обрезается
многоточием; полный путь доступен в `title`. Пустое состояние центрируется,
пояснение ограничено шириной 320px. Сообщение переносит длинные строки
и прокручивается при превышении высоты 100px.

## Elevation & Depth

Теней нет. Иерархию образуют пространство вывода, разделители toolbar/footer
(1px), фон списка и состояния управления. Полоса ошибки занимает место
над терминалом, а не перекрывает его.

## Shapes

Почти прямоугольные элементы с радиусами из frontmatter. Квадратные кнопки
toolbar содержат контурные SVG (16px) с текущим цветом текста.
Поверхности не оформлены карточками.

## Components

- **Toolbar:** список, статус и действия «Новый Bash», «Очистить экран»,
  «Закрыть сессию», «Путь к Bash». Иконки имеют `aria-label` и `title`.
  Без сессии очистка и закрытие отключены (opacity 0.35). Наведение меняет
  фон без перехода. Фокус — рамка (1px, offset −1px); forced-colors добавляет
  системные границы.
- **Выбор сессии:** нативный `select` с именем «Сессия Bash». Завершённые
  и ошибочные сессии имеют текстовые суффиксы. Выбор возвращает фокус в терминал.
- **Пустое состояние:** знак терминала, «Bash в вашей IDE», пояснение
  о серверном каталоге и «Открыть Bash». Показ панели сам не запускает процесс.
- **Терминал:** отдельная xterm-поверхность каждой сессии; неактивные скрыты.
  Включён `screenReaderMode`, `scrollback` — 2000 строк. Очистка экрана
  сохраняет сессию и возвращает фокус.
- **Статус и сообщение:** `role="status"` сообщает запуск, работу,
  завершение с кодом или ошибку; `role="alert"` содержит пояснение.
  Ошибка сессии скрывается при переключении на другую и восстанавливается
  при возвращении. Общее уведомление host не привязано к сессии.
- **Footer:** `cwd` из состояния выбранной сессии. Без сессии — напоминание
  «Команды выполняются на сервере Элемента».

## Do's and Don'ts

### Do:

- Do наследовать семантические токены VS Code и сохранять светлую, тёмную и forced-colors темы.
- Do отдавать свободное пространство терминалу и возвращать в него фокус после выбора сессии и очистки.
- Do показывать ошибку конкретной сессии только в контексте этой сессии.
- Do сохранять русские подписи, доступные имена и видимую рамку клавиатурного фокуса.

### Don't:

- Don't заменять выбранный нативный стиль карточками, тенями, рекламными блоками или декоративной анимацией.
- Don't фиксировать собственную палитру поверх токенов IDE.
- Don't представлять браузерные снимки и статическую проверку panel → bottom как нативный запуск в Элементе.
