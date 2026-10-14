Eva no Lixo Zero - a queda de Lixorion
Versao 3.0

COMO ABRIR
1. Extraia o ZIP inteiro (as pastas assets, img, sounds, cutscene e js
   precisam ficar junto do index.html).
2. Abra index.html em qualquer navegador moderno,
   ou de dois cliques em JOGAR.bat no Windows.
3. Funciona offline, sem instalar nada e sem conexao com a internet.

A HISTORIA
Lixorion e uma criatura formada por lixo descartado incorretamente:
restos organicos, plastico, pneus, latas, garrafas, metal, papelao, lama
e sucata. Quanto mais o mundo joga fora sem separar, mais ele cresce.
Eva precisa limpar o caminho, derrotar os monstros enviados por ele
e enfrenta-lo no proprio nucleo para salvar o mundo da poluicao.

CONTROLES
- A/D ou setas esquerda/direita ... mover
- W, seta para cima ou Espaco .... pular (segure para pular mais alto)
- S ou seta para baixo ........... agachar
- J ou Z ......................... soco
- K ou X ......................... Eco Power
- P ou Esc ....................... pausar
- M .............................. ligar/desligar o som
- R .............................. reiniciar a fase
- Esc, Enter ou Espaco ........... pular cutscene
- No celular ou tablet: botoes na tela (esquerda, direita, agachar,
  pulo, soco e Eco Power), com suporte a varios toques ao mesmo tempo.

OBJETIVO
- Recolha TODO o material reciclavel de cada fase: papel, plastico,
  metal e vidro. O portal so abre com o medidor cheio.
- Cada reciclavel tambem recarrega parte do Eco Power.
- Derrote ou desvie dos monstros de Lixorion.
- Sao 3 vidas; cada fase concluida devolve uma (ate 5).
- Fases longas tem checkpoints: morrer devolve a Eva ao ultimo ponto,
  sem perder os reciclaveis ja coletados na tentativa.
- Terminar rapido rende bonus de tempo na pontuacao.

COMBATE
- Soco: dano corpo a corpo, so acerta durante a janela ativa do golpe.
- Eco Power: onda ecologica que atravessa varios inimigos, tem custo
  e recarrega sozinha com o tempo (mais rapido ao coletar reciclaveis).
- Ao levar dano a Eva fica invulnerivel por um instante e sofre recuo.

AS FASES
1. Floresta Renovada .............. goblins de residuos
2. Rio Poluido .................... goblins e Latoes
3. Praia Contaminada .............. goblins e moscas mutantes
4. Zona Industrial Contaminada .... os tres tipos juntos
5. Nucleo de Lixorion ............. batalha final

OS MONSTROS
- Goblin de residuos: pequeno e agil, patrulha, corre atras da Eva e
  ataca de perto.
- Latao: pesado, lento, resistente, prepara o golpe antes de acertar e
  empurra muito mais longe.
- Mosca mutante: voa o tempo todo, oscila no ar, atira bolas de lixo e
  mergulha sobre a Eva.

LIXORION
A batalha final tem barra de vida propria e tres fases:
- 100% a 66%: golpes lentos e bem telegrafados.
- 66% a 33%: entram projeteis de gosma e um monstro de apoio.
- abaixo de 33%: mais velocidade, investida e combinacoes.
Os residuos espalhados na arena recarregam o Eco Power, e acertar
Lixorion com ele o deixa instavel e vulneravel por alguns segundos.
Socos comuns tambem causam dano, entao a luta nunca trava.

O QUE TEM NESTA VERSAO
- 4 fases + batalha final, com cenarios panoramicos desenhados a mao.
- Eva com animacoes completas: parada, corrida, pulo, queda, agachar,
  soco, Eco Power, dano e derrota.
- Tres tipos de monstro com sprites e comportamentos proprios.
- Lixorion como chefao jogavel, com padroes previsiveis e justos.
- 10 cutscenes em video ligando toda a campanha, com opcao de pular.
- Trilha sonora em MP3, uma faixa por fase, sem sobreposicao.
- Efeitos sonoros dedicados para coleta, dano, impacto e derrota.
- Menu principal, configuracoes, creditos e duas cenas pos-credito.
- Checkpoints, particulas, tremor de tela e recordes salvos no navegador.

DICAS
- Da para pular por um instante mesmo depois de sair da beirada.
- Soltar o botao de pulo mais cedo faz a Eva subir menos.
- Guarde o Eco Power para grupos de inimigos e para o chefao.
- Agachar reduz o tamanho da Eva e ajuda a passar por ataques altos.

ARQUIVOS
- index.html ......... estrutura da pagina
- styles.css ......... visual da interface
- js/ ................ motor do jogo (assets, audio, cutscenes, fases,
                       entidades, desenho e maquina de estados)
- assets/ ............ icone e arte antiga do menu
- img/ ............... mapas, sprites e plataformas originais
- img/generated/ ..... versoes preparadas dos sprites e mapas,
                       criadas por tools/extract_sprites.py
- sounds/ ............ musicas e efeitos em MP3
- cutscene/ .......... videos da campanha
- tools/ ............. scripts de preparo dos assets e verificacao
- JOGAR.bat .......... atalho para abrir no Windows

SOBRE O SOM
A musica e os efeitos vem de arquivos MP3 reais. Apenas alguns sons
curtos (pulo, aterrissagem e cliques da interface) continuam sendo
sintetizados pelo proprio navegador. Alguns navegadores so liberam o
audio depois do primeiro clique ou toque na tela.

REGERAR OS SPRITES (opcional)
Os arquivos de img/generated/ ja vem prontos. Para recria-los a partir
dos originais e preciso Python com Pillow, NumPy e SciPy:

    python tools/extract_sprites.py

Os arquivos originais nunca sao alterados nem sobrescritos.
