# Action Elite

Jogo de tiro em primeira pessoa para o navegador, jogável **offline** e **online contra jogadores reais**.
Projeto novo, escrito do zero (TypeScript + three.js). Todo o conteúdo (mapa, armas, texturas, modelos, sons) é original e gerado por código:
não há arquivos de imagem, áudio ou modelo, nem dados ou protocolo de outro jogo. O resultado é **um único `action-elite.html`**.

## Plano em 5 partes

| Parte | Conteúdo | Estado |
|---|---|---|
| 1 | Base do jogo: motor, mapa, movimento, 6 armas, alvos, HUD, som, menus, configurações. Treino offline. | **pronta** |
| 2 | Bots com IA e modos offline: Deathmatch, Missão Bomba, rodadas, placar, menus de sala e perfil. | |
| 3 | Servidor online (um arquivo só): salas, partidas multiplayer reais, Deathmatch e Missão Bomba online. | |
| 4 | Loja, inventário, diamantes (Supabase), progressão e mais modos: Sabotagem, Defesa, HeadHunter, Caos. | |
| 5 | Acabamento: mais mapas, armas e efeitos, toque e controle, offline completo, balanceamento e implantação (Render + Supabase). | |

## Como jogar (Parte 1)

Abra `action-elite.html` no navegador (duplo clique serve) e clique em **Treino offline**.

| Tecla | Ação |
|---|---|
| W A S D | mover |
| Mouse | mirar |
| Botão esquerdo | atirar |
| Botão direito | mira da Longbow (2 níveis de zoom) |
| Shift / Espaço / Ctrl ou C | correr / pular / agachar |
| R | recarregar |
| 1 a 6 ou roda do mouse | trocar de arma (Machete, Viper P9, Spitfire S35, Raptor AR, Hammer 12, Longbow X) |
| Q | arma anterior |
| Esc | pausar |

## Desenvolvimento

```sh
npm install
npm run dev          # http://localhost:8000
npm run test:sim     # regras do jogo (movimento, tiros, dano, recarga), sem navegador
npm run build        # gera dist/action-elite.html (um arquivo só)
```

## Estrutura

| Pasta | O que é |
|---|---|
| `src/sim/` | regras puras, sem three.js nem DOM: mapa, movimento, armas, tiros. O mesmo código rodará no servidor (parte 3). |
| `src/game/` | `session.ts` (sessão do jogador: armas, recuo, recarga, dano, alvos) e `game.ts` (laço do jogo). |
| `src/render/` | cena 3D, texturas geradas por código, modelos, arma em primeira pessoa, efeitos. |
| `src/ui/` | HUD, menus e estilos. |
| `src/core/` | entrada (teclado, mouse, trava do ponteiro), som sintetizado e configurações. |

## Licença

MIT, veja `LICENSE`.
