// Pink sandbox helper (card 1dfwh7kfzxu, owner 2026-11-19): runs a command under a write-restricted token, as Codex does
// on Windows. Usage: pink-sandbox.exe <SID> -- <program> [args...]  |  pink-sandbox.exe --grant|--revoke|--has <SID> <folder>
// Writes need the normal check AND a check against the restricting SIDs (the Pink SID, the logon SID and Everyone), so
// the command writes only where the Pink SID was granted (the project and the sandbox temp folder, by pink-sandbox.ts) or
// where Everyone can already write (known limit). Reads and network are untouched. The child runs in a Job Object that
// kills the whole tree when this process ends. Compiled on first use with the csc.exe that ships with Windows.
using System;
using System.Collections.Generic;
using System.ComponentModel;
using System.Runtime.InteropServices;
using System.Security.Principal;
using System.Text;

static class PinkSandbox
{
	const uint TOKEN_ASSIGN_PRIMARY = 0x1, TOKEN_DUPLICATE = 0x2, TOKEN_QUERY = 0x8, TOKEN_ADJUST_DEFAULT = 0x80, TOKEN_ADJUST_SESSIONID = 0x100;
	const uint DISABLE_MAX_PRIVILEGE = 0x1, WRITE_RESTRICTED = 0x8;
	const int TokenGroups = 2, TokenDefaultDacl = 6;
	const uint SE_GROUP_LOGON_ID = 0xC0000000;
	const uint CREATE_SUSPENDED = 0x4, CREATE_UNICODE_ENVIRONMENT = 0x400;
	const uint STARTF_USESTDHANDLES = 0x100;
	const int JobObjectExtendedLimitInformation = 9, JobObjectBasicUIRestrictions = 4;
	// no windows of other processes (keys, messages), clipboard, global atoms, desktop, system settings, logoff
	const uint JOB_UI_ALL = 0x1 | 0x2 | 0x4 | 0x8 | 0x10 | 0x20 | 0x40 | 0x80;
	const uint JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE = 0x2000;
	const uint INFINITE = 0xFFFFFFFF;

	[StructLayout(LayoutKind.Sequential)] struct SID_AND_ATTRIBUTES { public IntPtr Sid; public uint Attributes; }
	[StructLayout(LayoutKind.Sequential)] struct TOKEN_DEFAULT_DACL { public IntPtr DefaultDacl; }
	[StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
	struct STARTUPINFO
	{
		public int cb; public string lpReserved, lpDesktop, lpTitle;
		public int dwX, dwY, dwXSize, dwYSize, dwXCountChars, dwYCountChars, dwFillAttribute, dwFlags;
		public short wShowWindow, cbReserved2; public IntPtr lpReserved2, hStdInput, hStdOutput, hStdError;
	}
	[StructLayout(LayoutKind.Sequential)] struct PROCESS_INFORMATION { public IntPtr hProcess, hThread; public int dwProcessId, dwThreadId; }
	[StructLayout(LayoutKind.Sequential)]
	struct JOBOBJECT_BASIC_LIMIT_INFORMATION
	{
		public long PerProcessUserTimeLimit, PerJobUserTimeLimit; public uint LimitFlags;
		public UIntPtr MinimumWorkingSetSize, MaximumWorkingSetSize; public uint ActiveProcessLimit;
		public UIntPtr Affinity; public uint PriorityClass, SchedulingClass;
	}
	[StructLayout(LayoutKind.Sequential)] struct IO_COUNTERS { public ulong a, b, c, d, e, f; }
	[StructLayout(LayoutKind.Sequential)]
	struct JOBOBJECT_EXTENDED_LIMIT_INFORMATION
	{
		public JOBOBJECT_BASIC_LIMIT_INFORMATION BasicLimitInformation; public IO_COUNTERS IoInfo;
		public UIntPtr ProcessMemoryLimit, JobMemoryLimit, PeakProcessMemoryUsed, PeakJobMemoryUsed;
	}

	[DllImport("kernel32.dll")] static extern IntPtr GetCurrentProcess();
	[DllImport("kernel32.dll")] static extern IntPtr GetStdHandle(int n);
	[DllImport("kernel32.dll", SetLastError = true)] static extern bool CloseHandle(IntPtr h);
	[DllImport("kernel32.dll", SetLastError = true)] static extern uint ResumeThread(IntPtr h);
	[DllImport("kernel32.dll", SetLastError = true)] static extern uint WaitForSingleObject(IntPtr h, uint ms);
	[DllImport("kernel32.dll", SetLastError = true)] static extern bool GetExitCodeProcess(IntPtr h, out uint code);
	[DllImport("kernel32.dll", SetLastError = true)] static extern bool TerminateProcess(IntPtr h, uint code);
	[DllImport("kernel32.dll", SetLastError = true, CharSet = CharSet.Unicode)] static extern IntPtr CreateJobObject(IntPtr a, string name);
	[DllImport("kernel32.dll", SetLastError = true)] static extern bool SetInformationJobObject(IntPtr job, int cls, ref JOBOBJECT_EXTENDED_LIMIT_INFORMATION info, int len);
	[DllImport("kernel32.dll", SetLastError = true)] static extern bool SetInformationJobObject(IntPtr job, int cls, ref uint uiRestrictions, int len);
	[DllImport("kernel32.dll", SetLastError = true)] static extern bool AssignProcessToJobObject(IntPtr job, IntPtr process);
	[DllImport("advapi32.dll", SetLastError = true)] static extern bool OpenProcessToken(IntPtr process, uint access, out IntPtr token);
	[DllImport("advapi32.dll", SetLastError = true)] static extern bool GetTokenInformation(IntPtr token, int cls, IntPtr buffer, int length, out int needed);
	[DllImport("advapi32.dll", SetLastError = true)] static extern bool SetTokenInformation(IntPtr token, int cls, ref TOKEN_DEFAULT_DACL info, int length);
	[DllImport("advapi32.dll", SetLastError = true)]
	static extern bool CreateRestrictedToken(IntPtr existing, uint flags, uint disableCount, IntPtr disable, uint deleteCount, IntPtr delete, uint restrictCount, SID_AND_ATTRIBUTES[] restrict, out IntPtr newToken);
	[DllImport("advapi32.dll", SetLastError = true, CharSet = CharSet.Unicode)] static extern bool ConvertStringSidToSid(string sid, out IntPtr psid);
	[DllImport("advapi32.dll", SetLastError = true, CharSet = CharSet.Unicode)] static extern bool ConvertSidToStringSid(IntPtr psid, out string sid);
	[DllImport("advapi32.dll", SetLastError = true, CharSet = CharSet.Unicode)]
	static extern bool ConvertStringSecurityDescriptorToSecurityDescriptor(string sddl, uint revision, out IntPtr sd, out uint size);
	[DllImport("advapi32.dll", SetLastError = true)] static extern bool GetSecurityDescriptorDacl(IntPtr sd, out bool present, out IntPtr dacl, out bool defaulted);
	[DllImport("advapi32.dll", SetLastError = true, CharSet = CharSet.Unicode)]
	static extern bool CreateProcessAsUser(IntPtr token, string app, StringBuilder cmd, IntPtr pa, IntPtr ta, bool inherit, uint flags, IntPtr env, string cwd, ref STARTUPINFO si, out PROCESS_INFORMATION pi);

	static void Check(bool ok, string what) { if (!ok) throw new Win32Exception(Marshal.GetLastWin32Error(), what); }

	// Microsoft C runtime argv rules: quote when needed, double backslashes before a quote
	public static string Quote(string arg)
	{
		if (arg.Length > 0 && arg.IndexOfAny(new[] { ' ', '\t', '\n', '\v', '"' }) < 0) return arg;
		var sb = new StringBuilder("\"");
		for (int i = 0; i < arg.Length; i++)
		{
			int slashes = 0;
			while (i < arg.Length && arg[i] == '\\') { slashes++; i++; }
			if (i == arg.Length) { sb.Append('\\', slashes * 2); break; }
			if (arg[i] == '"') sb.Append('\\', slashes * 2 + 1).Append('"');
			else sb.Append('\\', slashes).Append(arg[i]);
		}
		return sb.Append('"').ToString();
	}

	static string LogonSid(IntPtr token)
	{
		int needed;
		GetTokenInformation(token, TokenGroups, IntPtr.Zero, 0, out needed);
		IntPtr buffer = Marshal.AllocHGlobal(needed);
		try
		{
			Check(GetTokenInformation(token, TokenGroups, buffer, needed, out needed), "GetTokenInformation");
			int count = Marshal.ReadInt32(buffer);
			int size = Marshal.SizeOf(typeof(SID_AND_ATTRIBUTES));
			for (int i = 0; i < count; i++)
			{
				var group = (SID_AND_ATTRIBUTES)Marshal.PtrToStructure(new IntPtr(buffer.ToInt64() + IntPtr.Size + i * size), typeof(SID_AND_ATTRIBUTES));
				if ((group.Attributes & SE_GROUP_LOGON_ID) == SE_GROUP_LOGON_ID)
				{
					string sid;
					Check(ConvertSidToStringSid(group.Sid, out sid), "ConvertSidToStringSid");
					return sid;
				}
			}
			return null;
		}
		finally { Marshal.FreeHGlobal(buffer); }
	}

	static IntPtr Sid(string text) { IntPtr sid; Check(ConvertStringSidToSid(text, out sid), "ConvertStringSidToSid " + text); return sid; }

	// icacls does not take a SID that maps to no account; .NET does. Inheritable, so it reaches what is created later too.
	static int Acl(string mode, string sid, string dir)
	{
		var identity = new SecurityIdentifier(sid);
		var security = System.IO.Directory.GetAccessControl(dir);
		var rule = new System.Security.AccessControl.FileSystemAccessRule(identity, System.Security.AccessControl.FileSystemRights.Modify,
			System.Security.AccessControl.InheritanceFlags.ContainerInherit | System.Security.AccessControl.InheritanceFlags.ObjectInherit,
			System.Security.AccessControl.PropagationFlags.None, System.Security.AccessControl.AccessControlType.Allow);
		bool has = false, denied = false;
		foreach (System.Security.AccessControl.FileSystemAccessRule existing in security.GetAccessRules(true, false, typeof(SecurityIdentifier)))
		{
			if (existing.IdentityReference.Value != sid) continue;
			if (existing.AccessControlType == System.Security.AccessControl.AccessControlType.Allow) has = true;
			else denied = true;
		}
		if (mode == "--deny" && denied) return 0;
		if (mode == "--has") return has ? 0 : 1;
		if (mode == "--grant") { if (!has) { security.AddAccessRule(rule); System.IO.Directory.SetAccessControl(dir, security); } return 0; }
		if (mode == "--deny")
		{
			// folders whose content runs later outside the sandbox (git hooks, project extensions): read yes, write no
			security.AddAccessRule(new System.Security.AccessControl.FileSystemAccessRule(identity,
				System.Security.AccessControl.FileSystemRights.Write | System.Security.AccessControl.FileSystemRights.Delete | System.Security.AccessControl.FileSystemRights.DeleteSubdirectoriesAndFiles | System.Security.AccessControl.FileSystemRights.ChangePermissions | System.Security.AccessControl.FileSystemRights.TakeOwnership,
				System.Security.AccessControl.InheritanceFlags.ContainerInherit | System.Security.AccessControl.InheritanceFlags.ObjectInherit,
				System.Security.AccessControl.PropagationFlags.None, System.Security.AccessControl.AccessControlType.Deny));
			System.IO.Directory.SetAccessControl(dir, security);
			return 0;
		}
		security.PurgeAccessRules(identity); // --revoke: tira a permissão e a negação do Pink
		System.IO.Directory.SetAccessControl(dir, security);
		return 0;
	}

	static int Main(string[] args)
	{
		if (args.Length == 3 && (args[0] == "--grant" || args[0] == "--revoke" || args[0] == "--has" || args[0] == "--deny"))
		{
			try { return Acl(args[0], args[1], args[2]); }
			catch (Exception error) { Console.Error.WriteLine("pink-sandbox: " + error.Message); return 126; }
		}
		int dash = Array.IndexOf(args, "--");
		if (args.Length < 3 || dash != 1 || !args[0].StartsWith("S-1-"))
		{
			Console.Error.WriteLine("usage: pink-sandbox.exe <SID> -- <program> [args...]");
			return 125;
		}
		try
		{
			string pinkSid = args[0];
			IntPtr token;
			Check(OpenProcessToken(GetCurrentProcess(), TOKEN_ASSIGN_PRIMARY | TOKEN_DUPLICATE | TOKEN_QUERY | TOKEN_ADJUST_DEFAULT | TOKEN_ADJUST_SESSIONID, out token), "OpenProcessToken");
			string logon = LogonSid(token);
			var restrict = new List<SID_AND_ATTRIBUTES> { new SID_AND_ATTRIBUTES { Sid = Sid(pinkSid) }, new SID_AND_ATTRIBUTES { Sid = Sid("S-1-1-0") } };
			if (logon != null) restrict.Add(new SID_AND_ATTRIBUTES { Sid = Sid(logon) });
			IntPtr restricted;
			Check(CreateRestrictedToken(token, DISABLE_MAX_PRIVILEGE | WRITE_RESTRICTED, 0, IntPtr.Zero, 0, IntPtr.Zero, (uint)restrict.Count, restrict.ToArray(), out restricted), "CreateRestrictedToken");
			// objects the child creates without an inherited ACL (pipes, its own process) must pass the restricted write check
			string user = WindowsIdentity.GetCurrent().User.Value;
			string sddl = "D:(A;;GA;;;" + user + ")(A;;GA;;;" + pinkSid + ")(A;;GA;;;SY)" + (logon != null ? "(A;;GA;;;" + logon + ")" : "");
			IntPtr sd; uint sdSize; bool present, defaulted; IntPtr dacl;
			Check(ConvertStringSecurityDescriptorToSecurityDescriptor(sddl, 1, out sd, out sdSize), "ConvertStringSecurityDescriptorToSecurityDescriptor");
			Check(GetSecurityDescriptorDacl(sd, out present, out dacl, out defaulted), "GetSecurityDescriptorDacl");
			var defaultDacl = new TOKEN_DEFAULT_DACL { DefaultDacl = dacl };
			Check(SetTokenInformation(restricted, TokenDefaultDacl, ref defaultDacl, Marshal.SizeOf(typeof(TOKEN_DEFAULT_DACL))), "SetTokenInformation");

			IntPtr job = CreateJobObject(IntPtr.Zero, null);
			Check(job != IntPtr.Zero, "CreateJobObject");
			var limits = new JOBOBJECT_EXTENDED_LIMIT_INFORMATION();
			limits.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
			Check(SetInformationJobObject(job, JobObjectExtendedLimitInformation, ref limits, Marshal.SizeOf(typeof(JOBOBJECT_EXTENDED_LIMIT_INFORMATION))), "SetInformationJobObject");
			uint ui = JOB_UI_ALL;
			Check(SetInformationJobObject(job, JobObjectBasicUIRestrictions, ref ui, sizeof(uint)), "SetInformationJobObject UI");

			var command = new StringBuilder();
			for (int i = 2; i < args.Length; i++) command.Append(i > 2 ? " " : "").Append(Quote(args[i]));
			var si = new STARTUPINFO { cb = Marshal.SizeOf(typeof(STARTUPINFO)), dwFlags = (int)STARTF_USESTDHANDLES, hStdInput = GetStdHandle(-10), hStdOutput = GetStdHandle(-11), hStdError = GetStdHandle(-12) };
			PROCESS_INFORMATION pi;
			// the program is an absolute path (resolved by pink-sandbox.ts): no search in the project folder
			Check(CreateProcessAsUser(restricted, args[2], command, IntPtr.Zero, IntPtr.Zero, true, CREATE_SUSPENDED | CREATE_UNICODE_ENVIRONMENT, IntPtr.Zero, Environment.CurrentDirectory, ref si, out pi), "CreateProcessAsUser");
			if (!AssignProcessToJobObject(job, pi.hProcess))
			{
				int error = Marshal.GetLastWin32Error();
				TerminateProcess(pi.hProcess, 126);
				throw new Win32Exception(error, "AssignProcessToJobObject");
			}
			ResumeThread(pi.hThread);
			CloseHandle(pi.hThread);
			WaitForSingleObject(pi.hProcess, INFINITE);
			uint code;
			GetExitCodeProcess(pi.hProcess, out code);
			return (int)code;
		}
		catch (Exception error)
		{
			Console.Error.WriteLine("pink-sandbox: " + error.Message);
			return 126;
		}
	}
}
