import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RULES, atOrAbove, decide, ruleById } from '../src/index.js';
import { lineOf, rulesOf, scanOf } from './helpers.js';

// Every rule of one file with a near miss on each side: the form that is reported and the form next to it that is not.
// The files are written inline, small enough to work out by hand.

const cs = (body) => `namespace Shop\n{\n    public class Work\n    {\n        public void Run()\n        {\n${body}\n        }\n    }\n}\n`;
const webConfig = (inner) => `<?xml version="1.0" encoding="utf-8"?>\n<configuration>\n${inner}\n</configuration>\n`;

test('hard-coded-secret: a password, pwd, account key or shared access key in web.config, never shown', () => {
  const text = webConfig([
    '  <connectionStrings>',
    '    <add name="Main" connectionString="Server=db.shop.test;User ID=app;Password=Tiger-Lily-9;" />',
    '    <add name="Old" connectionString="Server=db.shop.test;Uid=app;Pwd = \'Opal-Moon-3\';" />',
    '    <add name="Trusted" connectionString="Server=db.shop.test;Integrated Security=SSPI;" />',
    '    <add name="Later" connectionString="Server=db.shop.test;Password=#{DbPassword}#;" />',
    '  </connectionStrings>',
    '  <appSettings>',
    '    <add key="Blob" value="DefaultEndpointsProtocol=https;AccountName=shop;AccountKey=c2hvcC1rZXk=" />',
    '    <add key="Bus" value="Endpoint=sb://bus.shop.test/;SharedAccessKeyName=send;Shared Access Key=YnVzLWtleQ==" />',
    '    <add key="SmtpPassword" value="Plum-Gate-4" />',
    '    <add key="PasswordMinLength" value="12" />',
    '    <add key="RequirePassword" value="true" />',
    '    <add key="VaultPassword" value="@Microsoft.KeyVault(VaultName=shop;SecretName=Smtp)" />',
    '    <add key="EmptyPassword" value="" />',
    '  </appSettings>',
    '  <system.net><mailSettings><smtp><network host="mail.shop.test" password="Fern-Hill-2" /></smtp></mailSettings></system.net>'
  ].join('\n'));
  const found = scanOf(text, 'web-config').filter((f) => f.rule === 'hard-coded-secret');
  assert.deepEqual(found.map((f) => f.line), [lineOf(text, 'Password=Tiger'), lineOf(text, 'Pwd ='), lineOf(text, 'AccountKey='), lineOf(text, 'Shared Access Key'), lineOf(text, 'SmtpPassword'), lineOf(text, 'Fern-Hill')]);
  assert.deepEqual(found.map((f) => f.found), [
    'the connection string "Main" holds Password= with a secret written in the file; the value is masked',
    'the connection string "Old" holds Pwd= with a secret written in the file; the value is masked',
    'the setting "Blob" holds AccountKey= with a secret written in the file; the value is masked',
    'the setting "Bus" holds Shared Access Key= with a secret written in the file; the value is masked',
    'the setting "SmtpPassword" holds a secret written in the file; the value is masked',
    'the attribute "password" of <network> holds a secret written in the file; the value is masked'
  ]);
  for (const secret of ['Tiger-Lily', 'Opal-Moon', 'c2hvcC1rZXk', 'YnVzLWtleQ', 'Plum-Gate', 'Fern-Hill']) assert.ok(found.every((f) => !f.found.includes(secret)), secret);
});

test('hard-coded-secret: a password in appsettings.json, in a name or in a connection string, and the near misses', () => {
  const text = '{\n  // "Password": "commented-out"\n  "ConnectionStrings": { "Main": "Server=db.shop.test;Password=Tiger-Lily-9;" },\n  "Smtp": { "Password": "Plum-Gate-4", "PasswordLength": "12", "UserPassword": "" },\n  "Storage": { "AccountKey": "${STORAGE_KEY}" },\n  "Bus": { "SharedAccessKey": "__BusKey__" }\n}\n';
  const found = scanOf(text, 'appsettings').filter((f) => f.rule === 'hard-coded-secret');
  assert.deepEqual(found.map((f) => [f.line, f.found]), [
    [3, 'the setting "Main" holds Password= with a secret written in the file; the value is masked'],
    [4, 'the setting "Password" holds a secret written in the file; the value is masked']
  ]);
});

test('registry-access: the registry types and calls, not a using directive or a word in a string', () => {
  const text = cs(['using Microsoft.Win32;', 'var k = Registry.LocalMachine.OpenSubKey("SOFTWARE\\\\Shop");', 'var v = Microsoft.Win32.Registry.GetValue("HKEY_LOCAL_MACHINE\\\\X", "Y", null);', 'key.CreateSubKey("Z");', 'var n = My.Computer.Registry.CurrentUser;', 'var label = "Registry settings";'].join('\n'));
  const found = scanOf(text, 'cs').filter((f) => f.rule === 'registry-access');
  assert.deepEqual(found.map((f) => f.line), [lineOf(text, 'Registry.LocalMachine'), lineOf(text, 'Microsoft.Win32.Registry.'), lineOf(text, 'CreateSubKey'), lineOf(text, 'My.Computer')]);
  assert.equal(found[0].found, 'the code uses the Windows registry through "Registry.LocalMachine"');
});

test('com-interop: DllImport, ComImport, CreateObject, ProgIDs, Marshal and VB Declare, and a COMReference', () => {
  const text = cs(['[DllImport("scale.dll")] static extern int Read();', '[ComImport, Guid("00000000-0000-0000-0000-000000000001")] interface IScale {}', 'var t = Type.GetTypeFromProgID("Shop.Scale");', 'Marshal.ReleaseComObject(t);', 'var created = factory.CreateObjects();'].join('\n'));
  assert.deepEqual(rulesOf(text, 'cs'), ['com-interop', 'com-interop', 'com-interop', 'com-interop']);
  const vb = 'Module Labels\n    Private Declare Function Beep Lib "kernel32" (ByVal f As Integer, ByVal d As Integer) As Integer\n    Sub Print()\n        Dim p = CreateObject("Shop.Printer")\n        \' Dim q = CreateObject("Shop.Old")\n    End Sub\nEnd Module\n';
  assert.deepEqual(scanOf(vb, 'vb').map((f) => [f.rule, f.line]), [['com-interop', 2], ['com-interop', 4]]);
  const project = '<Project>\n  <ItemGroup>\n    <COMReference Include="ShopScale">\n      <Guid>{0}</Guid>\n    </COMReference>\n    <Reference Include="ShopScale.Interop" />\n  </ItemGroup>\n</Project>\n';
  assert.deepEqual(scanOf(project, 'project').map((f) => [f.rule, f.line, f.found]), [['com-interop', 3, 'the project references the COM component "ShopScale"']]);
});

test('local-disk-write: a write to a drive, a share, a Unix data folder or the app folder, on the line or named above it', () => {
  const text = cs([
    'File.WriteAllText(path, body);',
    'File.WriteAllText(@"C:\\Shop\\out.txt", body);',
    'var share = @"\\\\files01\\shop\\";',
    'File.Copy(a, share + "x", true);',
    'Directory.CreateDirectory("D:/Shop/Archive");',
    'using (var w = new StreamWriter("/var/shop/log.txt")) { }',
    'upload.SaveAs(Server.MapPath("~/App_Data/x.png"));',
    'File.WriteAllText(Path.Combine(Path.GetTempPath(), "x"), body);',
    'var ignored = File.ReadAllText(@"C:\\Shop\\in.txt");',
    '// File.Delete(@"C:\\Shop\\old.txt");',
    'db.SaveChanges();'
  ].join('\n'));
  const found = scanOf(text, 'cs').filter((f) => f.rule === 'local-disk-write');
  assert.deepEqual(found.map((f) => f.line), [lineOf(text, 'File.WriteAllText(@'), lineOf(text, 'File.Copy'), lineOf(text, 'Directory.Create'), lineOf(text, 'new StreamWriter'), lineOf(text, 'upload.SaveAs')]);
  assert.deepEqual(found.map((f) => f.found), [
    'the code writes a file through "File.WriteAllText(" to the local path "C:\\Shop\\out.txt"',
    'the code writes a file through "File.Copy(" to the local path "\\\\files01\\shop\\" (named 1 line above)',
    'the code writes a file through "Directory.CreateDirectory(" to the local path "D:/Shop/Archive"',
    'the code writes a file through "newStreamWriter(" to the local path "/var/shop/log.txt"',
    'the code writes a file through ".SaveAs(" to a path in the folder of the app ("Server.MapPath")'
  ]);
});

test('local-disk-write: a path more than three lines above is not seen, and a VB path is read without escapes', () => {
  const far = cs(['var root = @"C:\\Shop\\";', 'var a = 1;', 'var b = 2;', 'var c = 3;', 'File.WriteAllText(root + "x", body);'].join('\n'));
  assert.deepEqual(rulesOf(far, 'cs'), []);
  const vb = 'Module Export\n    Sub Save()\n        File.WriteAllText("C:\\Shop\\out.txt", body)\n    End Sub\nEnd Module\n';
  assert.deepEqual(scanOf(vb, 'vb').map((f) => f.found), ['the code writes a file through "File.WriteAllText(" to the local path "C:\\Shop\\out.txt"']);
});

test('windows-authentication: web.config and the code, not Forms authentication', () => {
  const text = webConfig('  <system.web>\n    <authentication mode="Windows" />\n    <identity impersonate="true" />\n  </system.web>\n  <system.webServer><security><authentication><windowsAuthentication enabled="true" /></authentication></security></system.webServer>');
  assert.deepEqual(scanOf(text, 'web-config').map((f) => [f.rule, f.line]), [['windows-authentication', 4], ['windows-authentication', 5], ['windows-authentication', 7]]);
  assert.deepEqual(rulesOf(webConfig('  <system.web>\n    <authentication mode="Forms" />\n    <identity impersonate="false" />\n  </system.web>'), 'web-config'), []);
  assert.deepEqual(rulesOf(cs('services.AddAuthentication(NegotiateDefaults.AuthenticationScheme).AddNegotiate();'), 'cs'), ['windows-authentication']);
  assert.deepEqual(rulesOf(cs('services.AddAuthentication().AddCookie();'), 'cs'), []);
});

test('smtp-pickup-directory: a pickup folder in web.config or the code, not an SMTP server', () => {
  const text = webConfig('  <system.net><mailSettings>\n    <smtp deliveryMethod="SpecifiedPickupDirectory">\n      <specifiedPickupDirectory pickupDirectoryLocation="C:\\Mail\\Pickup" />\n    </smtp>\n  </mailSettings></system.net>');
  assert.deepEqual(scanOf(text, 'web-config').map((f) => [f.rule, f.line]), [['smtp-pickup-directory', 4], ['local-path-setting', 5]]);
  assert.deepEqual(rulesOf(webConfig('  <system.net><mailSettings><smtp deliveryMethod="Network"><network host="mail.shop.test" port="25" /></smtp></mailSettings></system.net>'), 'web-config'), []);
  assert.deepEqual(rulesOf(cs('client.DeliveryMethod = SmtpDeliveryMethod.PickupDirectoryFromIis;'), 'cs'), ['smtp-pickup-directory']);
  assert.deepEqual(rulesOf(cs('client.DeliveryMethod = SmtpDeliveryMethod.Network;'), 'cs'), []);
});

test('msmq: System.Messaging, queues, format names, WCF bindings and the project reference', () => {
  assert.deepEqual(rulesOf(cs('var q = new MessageQueue(@".\\private$\\orders");\nif (MessageQueue.Exists(path)) { }'), 'cs'), ['msmq', 'msmq']);
  assert.deepEqual(rulesOf(cs('var q = new ServiceBusClient(connection);'), 'cs'), []);
  const text = webConfig('  <system.serviceModel>\n    <bindings><netMsmqBinding><binding name="q" /></netMsmqBinding></bindings>\n    <client><endpoint address="net.msmq://localhost/private/orders" binding="netMsmqBinding" contract="IOrders" /></client>\n  </system.serviceModel>');
  assert.deepEqual(scanOf(text, 'web-config').map((f) => [f.rule, f.line]), [['msmq', 4], ['msmq', 5]]);
  assert.deepEqual(rulesOf('<Project>\n  <ItemGroup>\n    <Reference Include="System.Messaging" />\n    <Reference Include="System.Messaging.Extras" />\n  </ItemGroup>\n</Project>\n', 'project'), ['msmq']);
});

test('event-log: EventLog calls, AddEventLog and the trace listener, not ILogger', () => {
  assert.deepEqual(rulesOf(cs('EventLog.WriteEntry("Shop", "x");\nvar log = new EventLog("Application");\nlogging.AddEventLog();\nvar l = new EventLogTraceListener("Shop");'), 'cs'), ['event-log', 'event-log', 'event-log', 'event-log']);
  assert.deepEqual(rulesOf(cs('logger.LogInformation("x");\nlogging.AddConsole();'), 'cs'), []);
});

test('inproc-session-state: InProc or no mode in web.config, the memory cache in code; StateServer and SQLServer are info', () => {
  const at = (inner) => scanOf(webConfig(`  <system.web>\n    ${inner}\n  </system.web>`), 'web-config').map((f) => [f.rule, f.found]);
  assert.deepEqual(at('<sessionState mode="InProc" />'), [['inproc-session-state', 'web.config sets <sessionState mode="InProc">, which keeps state in the memory of one instance']]);
  assert.deepEqual(at('<sessionState timeout="20" />'), [['inproc-session-state', 'web.config has <sessionState> with no mode, so state is kept InProc, in the memory of one instance']]);
  assert.deepEqual(at('<sessionState mode="StateServer" stateConnectionString="tcpip=state.shop.test:42424" />'), [['state-server-session', 'web.config sets <sessionState mode="StateServer">, which keeps state in the ASP.NET state service']]);
  assert.deepEqual(at('<sessionState mode="SQLServer" sqlConnectionString="Data Source=db.shop.test;Integrated Security=SSPI" />').map((x) => x[0]), ['state-server-session']);
  assert.deepEqual(at('<sessionState mode="Custom" customProvider="Redis" />'), []);
  assert.deepEqual(at('<sessionState mode="Off" />'), []);
  assert.deepEqual(rulesOf(cs('services.AddDistributedMemoryCache();'), 'cs'), ['inproc-session-state']);
  assert.deepEqual(rulesOf(cs('services.AddStackExchangeRedisCache(o => o.Configuration = c);\nservices.AddMemoryCache();'), 'cs'), []);
});

test('non-standard-port: ports in URLs and listen calls, not 80 or 443, and not an outbound URL', () => {
  const text = cs([
    'builder.WebHost.UseUrls("http://*:5000", "https://*:443");',
    'options.ListenAnyIP(8080);',
    'options.Listen(IPAddress.Loopback, 7001);',
    'var ep = new IPEndPoint(IPAddress.Parse("10.1.2.3"), 9000);',
    'options.ListenAnyIP(80);',
    'var client = new HttpClient { BaseAddress = new Uri("http://rates.shop.test:8443/") };'
  ].join('\n'));
  assert.deepEqual(scanOf(text, 'cs').map((f) => [f.rule, f.line, f.found]), [
    ['non-standard-port', lineOf(text, 'UseUrls'), 'the code binds the port 5000'],
    ['non-standard-port', lineOf(text, 'ListenAnyIP(8080'), 'the code binds the port 8080'],
    ['non-standard-port', lineOf(text, 'IPAddress.Loopback'), 'the code binds the port 7001'],
    ['non-standard-port', lineOf(text, 'new IPEndPoint'), 'the code binds the port 9000']
  ]);
  const json = '{\n  "Urls": "http://0.0.0.0:5000;https://0.0.0.0:5001",\n  "Kestrel": { "Endpoints": { "Http": { "Url": "http://*:80" } } },\n  "Rates": { "BaseUrl": "http://rates.shop.test:8443" },\n  "HTTP_PORTS": "8080;80"\n}\n';
  assert.deepEqual(scanOf(json, 'appsettings').map((f) => [f.rule, f.line, f.found]), [['non-standard-port', 2, 'the setting "Urls" binds the ports 5000 and 5001'], ['non-standard-port', 5, 'the setting "HTTP_PORTS" binds the port 8080']]);
});

test('raw-socket: a listener of its own, not an outbound socket', () => {
  assert.deepEqual(rulesOf(cs('var l = new TcpListener(IPAddress.Any, 80);\nvar h = new HttpListener();\nvar u = new UdpClient(514);'), 'cs'), ['raw-socket', 'raw-socket', 'raw-socket']);
  assert.deepEqual(rulesOf(cs('var c = new TcpClient("smtp.shop.test", 25);\nvar u = new UdpClient();'), 'cs'), []);
});

test('background-work: Windows services, hosted services, queued work and scheduled tasks', () => {
  assert.deepEqual(rulesOf('public class Sync : ServiceBase { }\nclass Feed : BackgroundService { }\nservices.AddHostedService<Feed>();\nHostingEnvironment.QueueBackgroundWorkItem(t => Run(t));\nhost.UseWindowsService();\nProcess.Start("schtasks", "/create");\n', 'cs'), ['background-work', 'background-work', 'background-work', 'background-work', 'background-work', 'background-work']);
  assert.deepEqual(rulesOf('Public Class Sync\n    Inherits ServiceBase\nEnd Class\n', 'vb'), ['background-work']);
  assert.deepEqual(rulesOf(cs('Task.Run(() => Work());\nvar service = new BackgroundServiceOptions();'), 'cs'), []);
  assert.deepEqual(rulesOf('<Project>\n  <ItemGroup>\n    <Reference Include="System.ServiceProcess" />\n  </ItemGroup>\n</Project>\n', 'project'), ['background-work']);
});

test('custom-module-handler, isapi-extension and url-rewrite: what web.config adds to IIS', () => {
  const text = webConfig([
    '  <system.webServer>',
    '    <modules>',
    '      <add name="Audit" type="Shop.Web.AuditModule, Shop.Web" />',
    '      <add name="Routing" type="System.Web.Routing.UrlRoutingModule" />',
    '      <remove name="WebDAVModule" />',
    '    </modules>',
    '    <handlers>',
    '      <add name="Thumb" path="thumb.axd" verb="GET" type="Shop.Web.ThumbHandler" />',
    '      <add name="Legacy" path="*.dll" verb="*" modules="IsapiModule" scriptProcessor="%SystemDrive%\\isapi\\legacy.dll" />',
    '      <add name="aspNetCore" path="*" verb="*" modules="AspNetCoreModuleV2" />',
    '    </handlers>',
    '    <isapiFilters><filter name="Gate" path="C:\\isapi\\gate.dll" /></isapiFilters>',
    '    <rewrite><rules>',
    '      <rule name="Https"><match url="(.*)" /></rule>',
    '      <rule><match url="old" /></rule>',
    '    </rules></rewrite>',
    '  </system.webServer>'
  ].join('\n'));
  assert.deepEqual(scanOf(text, 'web-config').map((f) => [f.rule, f.found]), [
    ['custom-module-handler', 'web.config adds the HTTP module "Audit" of type "Shop.Web.AuditModule"'],
    ['custom-module-handler', 'web.config adds the HTTP handler "Thumb" of type "Shop.Web.ThumbHandler"'],
    ['isapi-extension', 'web.config maps the handler "Legacy" to an ISAPI extension'],
    ['isapi-extension', 'web.config adds an ISAPI filter "C:\\isapi\\gate.dll"'],
    ['url-rewrite', 'web.config has the URL Rewrite rule "Https"'],
    ['url-rewrite', 'web.config has the URL Rewrite rule']
  ]);
});

test('local-path-setting: a drive, share or Unix data path in a setting, not a relative path or a URL', () => {
  const text = webConfig('  <appSettings>\n    <add key="Uploads" value="E:\\Shop\\Uploads" />\n    <add key="Share" value="\\\\files01\\shop" />\n    <add key="Cache" value="~/App_Data/cache" />\n    <add key="Api" value="https://api.shop.test/v1" />\n  </appSettings>');
  assert.deepEqual(scanOf(text, 'web-config').map((f) => [f.line, f.found]), [[4, 'web.config sets the setting "Uploads" to "E:\\Shop\\Uploads", a local path'], [5, 'web.config sets the setting "Share" to "\\\\files01\\shop", a local path']]);
  assert.deepEqual(scanOf('{\n  "Exports": "/mnt/exports",\n  "Temp": "/tmp/shop",\n  "Root": "C:\\\\Shop"\n}\n', 'appsettings').map((f) => [f.line, f.found]), [[2, 'the setting "Exports" is "/mnt/exports", a local path'], [4, 'the setting "Root" is "C:\\\\Shop", a local path']]);
});

test('rules: every rule has an id, a key or none, a basis, a choice and a fix; the levels and the result', () => {
  assert.equal(RULES.length, 21);
  assert.deepEqual(RULES.filter((r) => r.key === null).map((r) => r.id), ['unreadable-file', 'scan-limit']);
  assert.equal(ruleById('msmq').key, 'msmq');
  assert.equal(ruleById('nope'), undefined);
  assert.ok(atOrAbove('error', 'warning'));
  assert.ok(!atOrAbove('info', 'warning'));
  assert.deepEqual(decide([{ level: 'warning' }, { level: 'info' }], 'error'), { pass: true, failOn: 'error', failing: 0, byLevel: { error: 0, warning: 1, info: 1 }, text: 'PASS - no finding at or above error (1 warning, 1 info)' });
  assert.equal(decide([{ level: 'error' }, { level: 'error' }], 'warning').text, 'FAIL - 2 findings at or above warning (2 error)');
  assert.equal(decide([], 'info').text, 'PASS - no finding at or above info');
});
