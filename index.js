const {
  Client,
  GatewayIntentBits,
  SlashCommandBuilder,
  Routes,
  REST,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  PermissionsBitField
} = require('discord.js');
const fs = require('fs');

const TOKEN = process.env.TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const THANKS_CHANNEL_ID = process.env.THANKS_CHANNEL_ID;

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent]
});

let adminRoleId = null;

/* ===== 슬래시 명령어 등록 ===== */
const commands = [
  new SlashCommandBuilder()
    .setName('계좌')
    .setDescription('계좌 정보 출력')
    .addStringOption(o =>
      o.setName('이름').setDescription('계좌 이름').setRequired(true))
    .addStringOption(o =>
      o.setName('금액').setDescription('송금 금액').setRequired(true)),

  new SlashCommandBuilder()
    .setName('계좌등록')
    .setDescription('관리자 전용 계좌 등록')
    .addStringOption(o => o.setName('이름').setDescription('표시 이름').setRequired(true))
    .addStringOption(o => o.setName('은행').setDescription('은행명').setRequired(true))
    .addStringOption(o => o.setName('계좌').setDescription('계좌번호').setRequired(true))
].map(cmd => cmd.toJSON());

const rest = new REST({ version: '10' }).setToken(TOKEN);
(async () => {
  try {
    await rest.put(Routes.applicationCommands(CLIENT_ID), { body: commands });
    console.log('✅ 슬래시 명령어 등록 완료');
  } catch (e) {
    console.error(e);
  }
})();

/* ===== 계좌 데이터 ===== */
let accounts = fs.existsSync('./accounts.json')
  ? JSON.parse(fs.readFileSync('./accounts.json'))
  : {};

function saveAccounts() {
  fs.writeFileSync('./accounts.json', JSON.stringify(accounts, null, 2));
}

client.once('ready', () => {
  console.log(`✅ 로그인됨: ${client.user.tag}`);
});

/* ===== 인터랙션 처리 ===== */
client.on('interactionCreate', async interaction => {

  if (interaction.isChatInputCommand()) {

    if (interaction.commandName === '계좌') {
      const name = interaction.options.getString('이름');
      const amount = interaction.options.getString('금액');
      const acc = accounts[name];
      if (!acc) return interaction.reply({ content: '❌ 해당 이름의 계좌가 없습니다.', ephemeral: true });

      const embed = new EmbedBuilder()
        .setTitle('💳 송금 정보')
        .addFields(
          { name: '이름', value: name, inline: true },
          { name: '금액', value: amount, inline: true },
          { name: '은행', value: acc.bank, inline: true },
          { name: '계좌번호', value: acc.number }
        )
        .setColor(0xff0000);

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`sent_${interaction.user.id}_${name}_${amount}`)
          .setLabel('💸 송금 완료')
          .setStyle(ButtonStyle.Success)
      );

      await interaction.reply({ embeds: [embed], components: [row] });
    }

    if (interaction.commandName === '계좌등록') {
      if (!interaction.memberPermissions.has(PermissionsBitField.Flags.Administrator)) {
        return interaction.reply({ content: '❌ 관리자만 사용 가능', ephemeral: true });
      }

      const name = interaction.options.getString('이름');
      const bank = interaction.options.getString('은행');
      const number = interaction.options.getString('계좌');

      accounts[name] = { bank, number };
      saveAccounts();

      interaction.reply(`✅ ${name} 계좌 등록 완료`);
    }
  }

  if (interaction.isButton()) {

    if (interaction.customId.startsWith('sent_')) {
      const [, buyerId, name, amount] = interaction.customId.split('_');

      if (interaction.user.id !== buyerId) {
        return interaction.reply({ content: '❌ 송금한 사람만 누를 수 있어요.', ephemeral: true });
      }

      const embed = new EmbedBuilder()
        .setTitle('✅ 송금 완료 요청')
        .setDescription(`<@${buyerId}> 님이 **${amount}** 송금을 완료했다고 알렸습니다.`)
        .setColor(0x00ff00);

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`confirm_${buyerId}_${name}_${amount}`)
          .setLabel('✔ 확인 완료')
          .setStyle(ButtonStyle.Primary)
      );

      await interaction.update({ embeds: [embed], components: [row] });
    }

    if (interaction.customId.startsWith('confirm_')) {
      if (!adminRoleId || !interaction.member.roles.cache.has(adminRoleId)) {
        return interaction.reply({ content: '❌ 관리자 역할만 확인할 수 있습니다.', ephemeral: true });
      }

      const [, buyerId, , amount] = interaction.customId.split('_');

      const channel = await client.channels.fetch(THANKS_CHANNEL_ID);
      channel.send(`🎉 <@${buyerId}>님 ${amount} 구매 감사합니다!`);

      await interaction.update({
        content: '✅ 거래 확인 완료!',
        embeds: [],
        components: []
      });
    }
  }
});

/* ===== 관리자 역할 수동 지정 ===== */
client.on('messageCreate', async message => {
  if (message.author.bot) return;

  if (message.content.startsWith('!관리자추가')) {
    if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
      return message.reply('❌ 서버 관리자만 설정할 수 있어요.');
    }

    const role = message.mentions.roles.first();
    if (!role) return message.reply('❌ 역할을 멘션해주세요.');

    adminRoleId = role.id;
    message.reply(`✅ 관리자 역할이 설정되었습니다: ${role.name}`);
  }
});

client.login(TOKEN);
