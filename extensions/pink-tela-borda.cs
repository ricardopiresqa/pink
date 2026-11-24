// Contorno da janela (ou da tela) que o agente do Pink está vendo ou acessando, na cor de destaque do tema.
// Lê comandos da entrada padrão, uma linha cada:  show hwnd <n> <rrggbb> | show pid <n> <rrggbb> | show screen 0 <rrggbb> | hide
// Fim da entrada (o Pink fechou ou desligou a tela) encerra o programa.
// A janela do contorno não pega clique nem foco, não aparece na barra de tarefas nem nas capturas de tela.
using System;
using System.Diagnostics;
using System.Drawing;
using System.Runtime.InteropServices;
using System.Threading;
using System.Windows.Forms;

class Borda : Form
{
	const int THICK = 4;
	const int IDLE_MS = 4000;
	IntPtr target = IntPtr.Zero;
	bool screen;
	DateTime last = DateTime.MinValue;
	Color color = Color.FromArgb(0x3b, 0x82, 0xf6);
	readonly System.Windows.Forms.Timer timer = new System.Windows.Forms.Timer();

	[DllImport("user32.dll")] static extern bool SetWindowDisplayAffinity(IntPtr h, uint a);
	[DllImport("user32.dll")] static extern bool IsWindow(IntPtr h);
	[DllImport("user32.dll")] static extern bool IsIconic(IntPtr h);
	[DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr h);
	[DllImport("user32.dll")] static extern bool GetWindowRect(IntPtr h, out RECT r);
	[DllImport("user32.dll")] static extern bool SetProcessDPIAware();
	[DllImport("user32.dll")] static extern bool SetProcessDpiAwarenessContext(IntPtr v);
	[DllImport("dwmapi.dll")] static extern int DwmGetWindowAttribute(IntPtr h, int a, out RECT r, int size);
	[StructLayout(LayoutKind.Sequential)] struct RECT { public int L, T, R, B; }

	Borda()
	{
		FormBorderStyle = FormBorderStyle.None;
		ShowInTaskbar = false;
		TopMost = true;
		StartPosition = FormStartPosition.Manual;
		BackColor = Color.Magenta;
		TransparencyKey = Color.Magenta;
		Text = "";
		timer.Interval = 60;
		timer.Tick += (s, e) => Follow();
		timer.Start();
	}

	protected override bool ShowWithoutActivation { get { return true; } }

	protected override CreateParams CreateParams
	{
		get
		{
			var p = base.CreateParams;
			// camada, clique atravessa, sem foco, fora do Alt+Tab, sempre por cima
			p.ExStyle |= 0x80000 | 0x20 | 0x8000000 | 0x80 | 0x8;
			return p;
		}
	}

	protected override void OnHandleCreated(EventArgs e)
	{
		base.OnHandleCreated(e);
		try { SetWindowDisplayAffinity(Handle, 0x11); } catch { } // WDA_EXCLUDEFROMCAPTURE: o modelo não vê o contorno
	}

	// tela inteira: um contorno por monitor (o retângulo único dos dois monitores ficava com bordas fora da tela)
	protected override void OnPaint(PaintEventArgs e)
	{
		using (var pen = new Pen(color, THICK))
		{
			if (!screen) { e.Graphics.DrawRectangle(pen, THICK / 2, THICK / 2, Width - THICK, Height - THICK); return; }
			foreach (var s in Screen.AllScreens)
			{
				var b = s.Bounds;
				e.Graphics.DrawRectangle(pen, b.X - Left + THICK / 2, b.Y - Top + THICK / 2, b.Width - THICK, b.Height - THICK);
			}
		}
	}

	public void Command(string line)
	{
		// lixo antes do comando (BOM de quem escreve na entrada, lido na página de código do console) é ignorado
		int start = 0;
		while (start < line.Length && !(line[start] >= 'a' && line[start] <= 'z')) start++;
		var parts = line.Substring(start).Trim().Split(' ');
		if (parts.Length == 0 || parts[0] != "show") { Stop(); return; }
		if (parts.Length < 4) return;
		long n;
		if (!long.TryParse(parts[2], out n)) return;
		int rgb;
		if (int.TryParse(parts[3], System.Globalization.NumberStyles.HexNumber, null, out rgb)) color = Color.FromArgb((rgb >> 16) & 255, (rgb >> 8) & 255, rgb & 255);
		screen = parts[1] == "screen";
		target = IntPtr.Zero;
		if (parts[1] == "hwnd") target = new IntPtr(n);
		else if (parts[1] == "pid") { try { target = Process.GetProcessById((int)n).MainWindowHandle; } catch { } }
		if (!screen && target == IntPtr.Zero) screen = true; // sem janela conhecida: contorna a tela
		last = DateTime.UtcNow;
		Invalidate();
		Follow();
	}

	void Stop()
	{
		last = DateTime.MinValue;
		Hide();
	}

	void Follow()
	{
		if ((DateTime.UtcNow - last).TotalMilliseconds > IDLE_MS) { if (Visible) Hide(); return; }
		Rectangle r;
		if (screen) r = SystemInformation.VirtualScreen;
		else
		{
			if (!IsWindow(target) || IsIconic(target) || !IsWindowVisible(target)) { if (Visible) Hide(); return; }
			RECT w;
			// limites sem a sombra invisível do Windows 10/11
			if (DwmGetWindowAttribute(target, 9, out w, Marshal.SizeOf(typeof(RECT))) != 0) GetWindowRect(target, out w);
			// por dentro da janela e recortado ao monitor dela: por fora, a janela maximizada perdia as bordas de cima e do
			// lado (fora da tela) e a do outro lado caía no monitor vizinho; sobrava só a de baixo
			var win = Rectangle.FromLTRB(w.L, w.T, w.R, w.B);
			r = Rectangle.Intersect(win, Screen.FromRectangle(win).Bounds);
			if (r.Width <= 2 * THICK || r.Height <= 2 * THICK) { if (Visible) Hide(); return; }
		}
		if (Bounds != r) { Bounds = r; Invalidate(); }
		if (!Visible) Show();
	}

	[STAThread]
	static void Main()
	{
		try { SetProcessDpiAwarenessContext(new IntPtr(-4)); } catch { try { SetProcessDPIAware(); } catch { } }
		var form = new Borda();
		var handle = form.Handle; // cria a janela antes de receber comandos
		new Thread(() =>
		{
			string line;
			try { while ((line = Console.In.ReadLine()) != null) { var copy = line; form.BeginInvoke((Action)(() => form.Command(copy))); } } catch { }
			try { form.BeginInvoke((Action)(() => Application.Exit())); } catch { }
		}) { IsBackground = true }.Start();
		Application.Run();
	}
}
