# Pre-code brainstorming record

Date: 2026-10-19, Asia/Almaty. Application code written at this point: none.

## Provenance

The quoted user message below is the current assignment, followed by actual assistant messages from this conversation. No replies, preferences, approvals or test outcomes have been invented. The user has not yet reviewed the proposed idea. Other design/scope decisions are explicitly assistant proposals.

## User assignment (verbatim)

> Pick a project idea, different from Part I, and come up with a non trivial app (no habit tracker, to-do list, etc).  Come up with an idea you will be proud to show off.
>
> If interested in startup and money part, get ideas from: https://trustmrr.com/
>
> - Fully follow:
> https://aishippingblog.com/p/ai-native-development-specifications
> https://aishippingblog.com/p/build-and-ship-a-full-stack-app-with
>
> I know they start from different places, but think about how can you combine.
>
> - Utilize Github Issues as in ai-native-development-specifications.
> - Use Non generic design agents like Lovable / v0 / Claude Design. OR at least provide good references for the coding agent.
> - Close all mvp tags. It can be up to 100 issues. (more is ok)
> - Use persistent storage as sqlLite.
> - Use dbms agnostic tools like ORM.
> - Work in iterations. First front end with mockService -> openapi.yml (describe contract) -> backend in memory story - > backend sqllite storage -> connect frontend + backend.
> - Add all your .md files to the github repo. Improve them while you develop.
> - Add your chat history where you brainstormed before creating an app as text file. (.md)
> - Actually run your app and throughly test it.
> - If found a bug, create an issue Github describe with Goal and Description and ask pm.md to groom and qa.md to add more test cases. Use tag user-test-bug. So that we know you actually tested. (Overall you will have mvp, post-mvp, user-test-bug tags).
> - Work and test until it's fully working and well tested.
> - Submit everything to github repo and close (qa-engineer.md should close it) all issues with mvp and user-test-bug tags before the deadline.

## Actual assistant messages

### First response

Прочитаю обе статьи и выберу идею, которая отличается от твоего StudyTrack из Part I. Потом разберу, как выполнить проект по этапам и что должно остаться в GitHub для сдачи.

### Idea selection

Выбираю **GearShare** — сервис бронирования университетской техники: камер, микрофонов и проекторов. В нём будут проверка пересекающихся броней, одобрение заявки, выдача и возврат оборудования. Это достаточно содержательный проект для портфолио.

Ключевое требование здесь — показать сам процесс разработки. GitHub Issues, роли PM/разработчика/QA и последовательные версии должны появляться по ходу работы, а не оформляться задним числом. Обе статьи как раз связывают эти этапы.

### Initial scope and repository dependency

Фиксирую MVP и план примерно на 20 задач — 100 issues делать необязательно. Для дизайна задам конкретные референсы и правила интерфейса.

Есть одно препятствие: сейчас доступен только репозиторий `studytrack`, а создать новый через подключённый GitHub я не могу. Подготовлю документы до написания кода; для дальнейшей работы по требуемому процессу понадобится ссылка на новый пустой репозиторий.

## Assistant decision record, not additional chat

These alternatives were evaluated while preparing the proposal; they were not presented as a fictional conversation with the user.

| Idea | Assessment |
| --- | --- |
| Study/deadline application | Rejected: too close to Part I |
| Shared trip expenses | Viable, but GearShare offers a clearer student-campus demo and physical-resource conflict rules |
| Room scheduling | Viable, but equipment custody adds a meaningful approval/checkout/return workflow |
| GearShare equipment lending | Selected: visible practical workflow, shared resources, authorization, concurrency, audit and persistence without external services |

Decisions proposed autonomously: single club, student/coordinator roles, no money handling, one physical unit per asset, day-based inclusive reservations, React/TypeScript frontend and Python/FastAPI backend with SQLAlchemy. See `plan.md` for precise rules and `architecture.md` for stack tradeoffs.

## Open dependency before implementation

Supply a new empty GitHub repository and make it available to the connected GitHub app. Only StudyTrack was returned by the repository-access check. No GearShare remote URL or issue IDs are known. The deadline was not included in the assignment text supplied here.

Append subsequent real brainstorming messages and material scope decisions here before implementing them. Keep planning alternatives labeled as proposals; never create fictional user endorsements.

## Actual user follow-up before implementation

The user selected the GitHub plugin and supplied the new repository:

> https://github.com/allfocusSS/gearshare

This resolves the repository dependency. It authorizes continuing the already requested project in that repository; it does not imply any test result.

### Actual access follow-up

User: `done` (after selecting the new repository). The first issue creation returned a GitHub integration 403. The assistant provided the installation settings link.

User: `done` (after adding repository access). The connection then listed `allfocusSS/gearshare`, and real issue publication began before application code.
