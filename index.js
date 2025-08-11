import express from 'express';
import 'dotenv/config';
import { Client, GatewayIntentBits, SlashCommandBuilder, REST, Routes, EmbedBuilder } from 'discord.js';
import { joinVoiceChannel, createAudioPlayer, createAudioResource, AudioPlayerStatus } from '@discordjs/voice';
import https from 'https';

const app = express();  // ← ここが必須！

const TOKEN = process.env.TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const VOICEVOX_APIKEY = process.env.VOICEVOX_APIKEY;

const quizSongs = [
  { title: 'discord通知', url: 'https://www.myinstants.com/media/sounds/discord-notification.mp3' },
  { title: 'discord退出', url: 'https://www.myinstants.com/media/sounds/discord-leave-noise.mp3' },
  { title: 'discord通話', url: 'https://www.myinstants.com/media/sounds/discord-call-sound.mp3' },
  { titel: 'discord待機', url: 'https://www.myinstants.com/media/sounds/discord-stage-channel-music.mp3' }
];

// ルートアクセス用の簡単なレスポンス
app.get('/', (req, res) => {
  res.send('イントロドンBotが稼働中！');
});

// サーバー起動
app.listen(PORT, () => {
  console.log(`Expressサーバーがポート${PORT}で起動しました`);
});

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMessageReactions,
  ],
});

function getVoicevoxAudioStream(text) {
  const url = `https://deprecatedapis.tts.quest/v2/voicevox/audio/?key=${VOICEVOX_APIKEY}&speaker=32&pitch=0&intonationScale=1&speed=1&text=${encodeURIComponent(text)}`;
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      if (res.statusCode !== 200) {
        reject(new Error(`VOICEVOX API error status: ${res.statusCode}`));
        return;
      }
      resolve(res);
    }).on('error', reject);
  });
}

const commands = [
  new SlashCommandBuilder()
    .setName('startquiz')
    .setDescription('イントロクイズを開始'),
].map((cmd) => cmd.toJSON());

const rest = new REST({ version: '10' }).setToken(TOKEN);
(async () => {
  await rest.put(Routes.applicationCommands(CLIENT_ID), { body: commands });
  console.log('✅ Slashコマンド登録完了');
})();

client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand()) return;
  if (interaction.commandName === 'startquiz') {
    const vc = interaction.member.voice.channel;
    if (!vc) {
      await interaction.reply('VCに入ってから使ってね！');
      return;
    }

    await interaction.reply('🎶 イントロクイズ始めるよ！');

    let remainingSongs = [...quizSongs];
    const connection = joinVoiceChannel({
      channelId: vc.id,
      guildId: vc.guild.id,
      adapterCreator: vc.guild.voiceAdapterCreator,
    });

    const player = createAudioPlayer();
    connection.subscribe(player);

    const playNext = () => {
      if (remainingSongs.length === 0) {
        interaction.followUp('🎉 全曲終了！お疲れさま！');
        connection.destroy();
        return;
      }

      const randomIndex = Math.floor(Math.random() * remainingSongs.length);
      const song = remainingSongs.splice(randomIndex, 1)[0];

      https.get(song.url, (res) => {
        const resource = createAudioResource(res);
        player.play(resource);

        setTimeout(async () => {
          player.stop();

          const embed = new EmbedBuilder()
            .setColor(0x1db954)
            .setTitle('⏸ わかった人〜？')
            .setDescription('✋ を一番早く押した人にメンション飛ばすよ！')
            .setFooter({ text: `残り曲数: ${remainingSongs.length}` });

          const quizMessage = await interaction.followUp({ embeds: [embed], fetchReply: true });
          await quizMessage.react('✋');

          const filter = (reaction, user) => reaction.emoji.name === '✋' && !user.bot;
          const collector = quizMessage.createReactionCollector({ filter, max: 1, time: 15000 });

          collector.on('collect', async (reaction, user) => {
            quizMessage.reply(`🎯 ${user} が一番乗り！`);

            // ずんだ読み上げ（白上虎太郎）音声再生
            try {
              const ttsText = `${user.username} さんが一番早かったよ！`;
              const audioStream = await getVoicevoxAudioStream(ttsText);
              const ttsResource = createAudioResource(audioStream);
              player.play(ttsResource);
            } catch (err) {
              console.error('VOICEVOX音声取得エラー:', err);
            }
          });

          collector.on('end', (collected) => {
            if (collected.size === 0) {
              quizMessage.reply('⏳ 誰もリアクションしなかったみたい…');
            }
            setTimeout(playNext, 3000);
          });
        }, 5000);
      }).on('error', (err) => {
        console.error('音源取得エラー:', err);
        setTimeout(playNext, 3000);
      });
    };

    playNext();
  }
});

client.login(TOKEN);
