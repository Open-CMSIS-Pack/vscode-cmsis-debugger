# Commits since v1.8.0

Commits reachable from `HEAD` (8c7d39f0b18f) after `v1.8.0` (c8a6a4630fcb), excluding the tagged commit. Listed newest first. This curated list omits 18 Dependabot commits, PR #1227, and 12 commits limited to tests, documentation, CI, development tooling, line endings, or command labels.

Total: 47 commits.

| Date | Commit | Author | Subject |
| --- | --- | --- | --- |
| 2026-10-09 | [ce5e8429](https://github.com/Open-CMSIS-Pack/vscode-cmsis-debugger/commit/ce5e842980b74ce660f93721d40995de15b1b5de) | Thorsten de Buhr | Improve SCVD expression diagnostics and skip invalid expressions (#1250) |
| 2026-10-09 | [c50556fb](https://github.com/Open-CMSIS-Pack/vscode-cmsis-debugger/commit/c50556fb59a09ee08b52a942c6854cf96bd615d4) | Jonatan Antoni | Bump pyTS to v0.7.0 for pre-release (#1258) |
| 2026-10-08 | [cb243cfd](https://github.com/Open-CMSIS-Pack/vscode-cmsis-debugger/commit/cb243cfd8cb8f0d724d4af3f4b510e6c20bd3165) | Jonatan Antoni | Hide unsupported settings from Trace Generation view (#1257) |
| 2026-10-08 | [b86f0259](https://github.com/Open-CMSIS-Pack/vscode-cmsis-debugger/commit/b86f0259233759739e1cf0e5aa28c8ba718d21fe) | Thorsten de Buhr | fix: allow empty SCVD text literals (#989) (#1249) |
| 2026-10-08 | [ec40967c](https://github.com/Open-CMSIS-Pack/vscode-cmsis-debugger/commit/ec40967cdbcb9a6cbccfb42add90c70979f264b2) | Arne Schmid | Fix CSV row store file replacement race (#1248) |
| 2026-10-07 | [c0e888a8](https://github.com/Open-CMSIS-Pack/vscode-cmsis-debugger/commit/c0e888a87972a28c8792c5ef4de4ac88570a9ee1) | Arne Schmid | Hide unset trace configuration label fields (#1246) |
| 2026-10-07 | [2cd876a1](https://github.com/Open-CMSIS-Pack/vscode-cmsis-debugger/commit/2cd876a12bc7b96cc7e30395ce3488c4585eb9ff) | Arne Schmid | Preserve trace configuration row focus after updates (#1245) |
| 2026-10-07 | [fd7ed76f](https://github.com/Open-CMSIS-Pack/vscode-cmsis-debugger/commit/fd7ed76f5d5324098c3c7592398cb12704d5bcb8) | Arne Schmid | Use primary modifier for CSV table shortcuts (#1240) |
| 2026-10-07 | [d1f2c4d7](https://github.com/Open-CMSIS-Pack/vscode-cmsis-debugger/commit/d1f2c4d715662fd2adce9cb6c0f55871cce02c69) | Arne Schmid | Fix CSV table row selection after reload (#1239) |
| 2026-10-06 | [a02fc4fa](https://github.com/Open-CMSIS-Pack/vscode-cmsis-debugger/commit/a02fc4fad75ad1bc79876286f73b6e32e7de2350) | Jonatan Antoni | Use pyts onedir release with post-extract normalization to remove symlinks unsupported by vsce (#1237) |
| 2026-10-06 | [fa36b1b9](https://github.com/Open-CMSIS-Pack/vscode-cmsis-debugger/commit/fa36b1b97024a66d9fa5dd3758652e595be16725) | Arne Schmid | Support trace-buffer captures in the captured-trace toolbar (#1235) |
| 2026-10-06 | [45e30502](https://github.com/Open-CMSIS-Pack/vscode-cmsis-debugger/commit/45e305027f7af449817bf94eb12fa41e388c31a0) | Jonatan Antoni | Rework Trace Generation View header showing .ctrace.yml file path and status (#1238) |
| 2026-10-02 | [28c16014](https://github.com/Open-CMSIS-Pack/vscode-cmsis-debugger/commit/28c160142e8d8bf283f26c563cfba9895acf2a55) | Arne Schmid | Feature/improved access to trace data (#1231) |
| 2026-10-02 | [f15097c4](https://github.com/Open-CMSIS-Pack/vscode-cmsis-debugger/commit/f15097c4031ae1320022b612c7913b3cca61d02a) | Jens Reinecke | Update ctrace (v0.4.0) and pyTS (0.6.1): `ctrace-ref:` and `source:` renaming (#1230) |
| 2026-10-02 | [3f1b964b](https://github.com/Open-CMSIS-Pack/vscode-cmsis-debugger/commit/3f1b964bc0e039f3b21051a4ac2cfe1bbab576ff) | Jonatan Antoni | Rename .ctrace-run.yml node ctrace-ref to ref (#1218) |
| 2026-10-01 | [bb0dff89](https://github.com/Open-CMSIS-Pack/vscode-cmsis-debugger/commit/bb0dff89bc65528c733829ddfc5b8866f3be908c) | Jonatan Antoni | Enable trace for start processor (#1229) |
| 2026-09-30 | [3313670f](https://github.com/Open-CMSIS-Pack/vscode-cmsis-debugger/commit/3313670f33f63ceff2c9d0643ec6ad4218f1c999) | Jonatan Antoni | Fix race condition between pyts exit code and file watch event (#1195) |
| 2026-09-30 | [5faaf2cf](https://github.com/Open-CMSIS-Pack/vscode-cmsis-debugger/commit/5faaf2cf7a74d18e150556e105e101a993b8831e) | Jonatan Antoni | Run pyTS on every change of cbuild-run file (#1203) |
| 2026-09-30 | [5d05535e](https://github.com/Open-CMSIS-Pack/vscode-cmsis-debugger/commit/5d05535eb6a3d1b540801138fc1ea6efb7358e3f) | Jonatan Antoni | Remove ctrace.yml backups before save (#1200) |
| 2026-09-28 | [859f9441](https://github.com/Open-CMSIS-Pack/vscode-cmsis-debugger/commit/859f9441aeef332d124ee1d61c888264ce6a986d) | Arne Schmid | Set default stream synchronization period to 16M (#1196) |
| 2026-09-28 | [bd15f815](https://github.com/Open-CMSIS-Pack/vscode-cmsis-debugger/commit/bd15f81561e71a54e65ed92f30b33edb39587054) | Jonatan Antoni | Remove dev setting `enableTraceGenerationView` (#1187) |
| 2026-09-28 | [45d5d057](https://github.com/Open-CMSIS-Pack/vscode-cmsis-debugger/commit/45d5d05734b904d3b3af883e089cd8d114b790e7) | Jens Reinecke | Generate `*.ctrace-run.yml` if missing on target switch (#1193) |
| 2026-09-28 | [822486f2](https://github.com/Open-CMSIS-Pack/vscode-cmsis-debugger/commit/822486f2fa2114152ca82237d5053e154225a27b) | Jens Reinecke | Trace Generation View Fixes (#1192) |
| 2026-09-25 | [8e8c7bdd](https://github.com/Open-CMSIS-Pack/vscode-cmsis-debugger/commit/8e8c7bdda0959e35333bda0d587141b523504a6d) | Arne Schmid | Add scalable SWO CSV table viewer (#1162) |
| 2026-09-25 | [8611ffcb](https://github.com/Open-CMSIS-Pack/vscode-cmsis-debugger/commit/8611ffcbc38bcc0386c1d239dfb9b484b0ca1008) | Jonatan Antoni | Run pyTS pre-validation and show validation messages (#1185) |
| 2026-09-24 | [ec504132](https://github.com/Open-CMSIS-Pack/vscode-cmsis-debugger/commit/ec5041329077a4086044fb50ecf36b2543dc81bc) | Jonatan Antoni | Add staged save/discard for Trace Generation settings (#1183) |
| 2026-09-24 | [4146e7a6](https://github.com/Open-CMSIS-Pack/vscode-cmsis-debugger/commit/4146e7a60262357a305814aa25a813b1097944cc) | Jens Reinecke | Bump ctrace to 0.3.1, catch up with TPIP (#1181) |
| 2026-09-23 | [b3be8cce](https://github.com/Open-CMSIS-Pack/vscode-cmsis-debugger/commit/b3be8cce026b313e1daf63f59e3b633da763239e) | Arne Schmid | Improve Trace Configuration View Controls and Layout (#1159) |
| 2026-09-23 | [578ee303](https://github.com/Open-CMSIS-Pack/vscode-cmsis-debugger/commit/578ee303ac7b36530c651cd08a61fc4967c5be98) | Jens Reinecke | Remove automatic 'monitor ctrace reload' call from pyTS controller (#1169) |
| 2026-09-22 | [c89979e7](https://github.com/Open-CMSIS-Pack/vscode-cmsis-debugger/commit/c89979e798d561bb968e5dff90812e951d3586d6) | Jens Reinecke | Detect switch of active solution (#1168) |
| 2026-09-22 | [767dd16d](https://github.com/Open-CMSIS-Pack/vscode-cmsis-debugger/commit/767dd16d479a33abd1394aa9eadc001088dbb41f) | Jens Reinecke | Support multi-solution workspace (#1167) |
| 2026-09-22 | [5c3c741c](https://github.com/Open-CMSIS-Pack/vscode-cmsis-debugger/commit/5c3c741c4d232d84e39a896adb61ea88cda48a16) | Jens Reinecke | Expand CBuildRunFileLocator to find and use cmsis.json (#1165) |
| 2026-09-22 | [6dd49f41](https://github.com/Open-CMSIS-Pack/vscode-cmsis-debugger/commit/6dd49f4152b9169515f4bccc0b446b1ea1452c77) | Jens Reinecke | Unify file watch mechanism (#1164) |
| 2026-09-18 | [afb3a59c](https://github.com/Open-CMSIS-Pack/vscode-cmsis-debugger/commit/afb3a59c6e2ff3cb7ed2ff32c1df6fdc9419c2a4) | Jens Reinecke | Refactor: CBuildRunFileLocator (#1161) |
| 2026-09-16 | [02e506f9](https://github.com/Open-CMSIS-Pack/vscode-cmsis-debugger/commit/02e506f951d472998511d9e0969ceae153e23f7c) | Jens Reinecke | Refactor and support for 'trace-buffer' (#1158) |
| 2026-09-16 | [32b50ef7](https://github.com/Open-CMSIS-Pack/vscode-cmsis-debugger/commit/32b50ef763ccc4a96ddf48fe6bee3e52b659c4cd) | Jens Reinecke | Use pyOCD nightly builds instead of builds from `features/trace` (#1155) |
| 2026-09-04 | [dc08258c](https://github.com/Open-CMSIS-Pack/vscode-cmsis-debugger/commit/dc08258cb3e8f925bb7618ec37a979e4a0e4e66f) | Omar Elkhouly | Updating default values for ctrace.yml and fixing race condition with csolution (#1148) |
| 2026-09-04 | [712766c1](https://github.com/Open-CMSIS-Pack/vscode-cmsis-debugger/commit/712766c1f8115e118e5e09977de35d020c16fc8d) | Arne Schmid | Fix/store empty yml nodes (#1118) |
| 2026-09-04 | [365a3ab8](https://github.com/Open-CMSIS-Pack/vscode-cmsis-debugger/commit/365a3ab82b08bf631865ad398546f1f0b96181bd) | Arne Schmid | Fix/ignore multiple file change events (#1138) |
| 2026-09-03 | [26b3c935](https://github.com/Open-CMSIS-Pack/vscode-cmsis-debugger/commit/26b3c935d1ac80efc92aa6321b2e7668ba7432b8) | Omar Elkhouly | verify that message origin is from the same window (#1145) |
| 2026-09-03 | [948a66a4](https://github.com/Open-CMSIS-Pack/vscode-cmsis-debugger/commit/948a66a457d12473253a321f644edfd04d464cf5) | Jens Reinecke | Update: arm-none-eabi-gdb 15.3.1 (#1141) |
| 2026-09-03 | [81052c83](https://github.com/Open-CMSIS-Pack/vscode-cmsis-debugger/commit/81052c8324e0cc5a854cef8fdca70d3bdd1239cb) | Jens Reinecke | Consolidate Dependabot Updates (#1144) |
| 2026-09-03 | [88ba79a3](https://github.com/Open-CMSIS-Pack/vscode-cmsis-debugger/commit/88ba79a315fd611528b674a7a71298a9e6bf3f7e) | Omar Elkhouly | Initialising a flow for generating a default ctrace.yml file (#1119) |
| 2026-08-20 | [0d81e9ab](https://github.com/Open-CMSIS-Pack/vscode-cmsis-debugger/commit/0d81e9ab39399ad7ec1c0737b4fbcc478c1e01ae) | Jens Reinecke | Trace Source Configuration, Capture, and Decode Flow (#1110) |
| 2026-08-19 | [68e608a1](https://github.com/Open-CMSIS-Pack/vscode-cmsis-debugger/commit/68e608a1de189e4ce2124414828336c40b129a32) | Omar Elkhouly | Watching cbuild run and generating a default ctrace accordingly (#1107) |
| 2026-08-18 | [fbd5abef](https://github.com/Open-CMSIS-Pack/vscode-cmsis-debugger/commit/fbd5abef67db937a480fe31c3303ddea6d930711) | Omar Elkhouly | Adjustments to Trace Generation view (#1101) |
| 2026-08-05 | [3bdb6dcf](https://github.com/Open-CMSIS-Pack/vscode-cmsis-debugger/commit/3bdb6dcf3ee9ce4bd7bd45f49cb789d78c8bc2a0) | Omar Elkhouly | Adding Trace Generation View (#1092) |
