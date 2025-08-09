import { useEffect, useMemo, useState } from 'react';

import DeleteIcon from './icons/delete-icon';
import EditIcon from './icons/edit-icon';
import SaveIcon from './icons/save-icon';

type LimitItem = { domain: string; minutesPerDay: number };
type PerSiteStatus = {
	domain: string;
	minutesPerDay: number;
	usedMs: number;
	limitMs: number;
	remainingMs: number;
};

type ChromeLike = {
	runtime: { sendMessage: (message: unknown) => Promise<unknown> };
};
declare const chrome: ChromeLike;

function normalizeDomain(input: string): string {
	const trimmed = input.trim();
	if (!trimmed) return '';
	try {
		const url = trimmed.includes('://') ? trimmed : `https://${trimmed}`;
		return new URL(url).hostname.replace(/^www\./, '');
	} catch {
		return trimmed.replace(/^www\./, '');
	}
}

function App() {
	const [limits, setLimits] = useState<LimitItem[]>([]);
	const [perSite, setPerSite] = useState<PerSiteStatus[]>([]);
	const [domainInput, setDomainInput] = useState('');
	const [minutesInput, setMinutesInput] = useState('');
	const [editing, setEditing] = useState<Record<string, boolean>>({});
	const [editValues, setEditValues] = useState<Record<string, string>>({});
	const isAddDisabled = useMemo(() => {
		const domain = normalizeDomain(domainInput);
		const minutes = Number(minutesInput);
		return !domain || !Number.isFinite(minutes) || minutes <= 0;
	}, [domainInput, minutesInput]);

	useEffect(() => {
		void refreshLimits();
	}, []);

	// Close the popup when the window loses focus (e.g., user clicks outside)
	useEffect(() => {
		function handleWindowBlur() {
			window.close();
		}

		function handleVisibilityChange() {
			if (document.visibilityState === 'hidden') {
				window.close();
			}
		}

		window.addEventListener('blur', handleWindowBlur);
		document.addEventListener('visibilitychange', handleVisibilityChange);
		return () => {
			window.removeEventListener('blur', handleWindowBlur);
			document.removeEventListener(
				'visibilitychange',
				handleVisibilityChange
			);
		};
	}, []);

	async function refreshLimits() {
		try {
			const [limitsRes, statusRes] = (await Promise.all([
				chrome.runtime.sendMessage({ type: 'LW_GET_LIMITS' }),
				chrome.runtime.sendMessage({ type: 'LW_GET_ALL_STATUS' }),
			])) as [{ limits?: LimitItem[] }, { items?: PerSiteStatus[] }];
			if (limitsRes?.limits) setLimits(limitsRes.limits);
			if (statusRes?.items) setPerSite(statusRes.items);
		} catch {
			console.error('Failed to get limits');
		}
	}

	async function onSubmit(e: React.FormEvent) {
		e.preventDefault();
		const domain = normalizeDomain(domainInput);
		const minutes = Number(minutesInput);
		if (!domain || !Number.isFinite(minutes) || minutes <= 0) return;
		try {
			const res = (await chrome.runtime.sendMessage({
				type: 'LW_SET_LIMIT',
				payload: { item: { domain, minutesPerDay: minutes } },
			})) as { ok?: boolean };
			if (res?.ok) {
				setDomainInput('');
				setMinutesInput('');
				await refreshLimits();
			}
		} catch {
			console.error('Failed to set limit');
		}
	}

	async function removeDomain(domain: string) {
		try {
			const res = (await chrome.runtime.sendMessage({
				type: 'LW_REMOVE_LIMIT',
				payload: { domain },
			})) as { ok?: boolean };
			if (res?.ok) await refreshLimits();
		} catch {
			console.error('Failed to remove limit');
		}
	}

	return (
		<div className='app-container' style={{ minWidth: 320, maxWidth: 420 }}>
			<header>
				<h1 className='title-1'>Limit Web Usage</h1>
			</header>
			<main>
				<form className='add-website-form' onSubmit={onSubmit}>
					<div className='group'>
						<input
							type='text'
							placeholder='Website URL or domain (e.g. facebook.com)'
							value={domainInput}
							onChange={(e) => setDomainInput(e.target.value)}
						/>
						<input
							type='number'
							min={1}
							placeholder='Time in minutes per day'
							value={minutesInput}
							onChange={(e) => setMinutesInput(e.target.value)}
						/>
					</div>
					<button
						type='submit'
						className='solid-success'
						disabled={isAddDisabled}
					>
						Add / Update
					</button>
				</form>

				<ul className='limited-websites-list'>
					{limits.length === 0 && (
						<li style={{ opacity: 0.7 }}>No limits yet.</li>
					)}
					{limits
						.slice()
						.sort((a, b) => a.domain.localeCompare(b.domain))
						.map((item) => (
							<li
								key={item.domain}
								className='limited-website-item'
							>
								<div className='limited-website-details'>
									<div style={{ fontWeight: 600 }}>
										{item.domain}
									</div>
									<div>
										{(() => {
											const status = perSite.find(
												(s) => s.domain === item.domain
											);
											if (!status) return null;
											const remainingMinutes = Math.ceil(
												status.remainingMs / 60000
											);
											return `${remainingMinutes} min left today`;
										})()}
									</div>
								</div>
								<div className='limited-website-controls'>
									{(() => {
										const isEditing =
											!!editing[item.domain];
										const value = isEditing
											? editValues[item.domain] ??
											  String(item.minutesPerDay)
											: String(item.minutesPerDay);
										const commit = async () => {
											const minutes = Number(value);
											setEditing((prev) => ({
												...prev,
												[item.domain]: false,
											}));
											if (
												!Number.isFinite(minutes) ||
												minutes <= 0 ||
												minutes === item.minutesPerDay
											)
												return;
											try {
												const res =
													(await chrome.runtime.sendMessage(
														{
															type: 'LW_SET_LIMIT',
															payload: {
																item: {
																	domain: item.domain,
																	minutesPerDay:
																		minutes,
																},
															},
														}
													)) as { ok?: boolean };
												if (res?.ok)
													await refreshLimits();
											} catch {
												console.error(
													'Failed to update limit'
												);
											}
										};
										return (
											<>
												<input
													type='number'
													min={1}
													disabled={!isEditing}
													value={value}
													onChange={(e) =>
														setEditValues(
															(prev) => ({
																...prev,
																[item.domain]:
																	e.target
																		.value,
															})
														)
													}
													onBlur={commit}
													style={{ width: 48 }}
													placeholder='min/day'
												/>
												{!isEditing ? (
													<button
														className='solid-success'
														onClick={() =>
															setEditing(
																(prev) => ({
																	...prev,
																	[item.domain]:
																		true,
																})
															)
														}
													>
														<EditIcon />
													</button>
												) : (
													<button
														className='solid-success'
														onClick={commit}
													>
														<SaveIcon />
													</button>
												)}
												<button
													className='solid-danger'
													onClick={() =>
														removeDomain(
															item.domain
														)
													}
												>
													<DeleteIcon />
												</button>
											</>
										);
									})()}
								</div>
							</li>
						))}
				</ul>
			</main>
		</div>
	);
}

export default App;
