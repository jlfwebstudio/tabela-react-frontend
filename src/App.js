// frontend/src/App.js
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import axios from 'axios';
import * as XLSX from 'xlsx-js-style';
// eslint-disable-next-line no-unused-vars
import { saveAs } from 'file-saver';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faFilter, faSortUp, faSortDown, faFileExcel, faFileUpload } from '@fortawesome/free-solid-svg-icons';
import './App.css';

function App() {
  const [data, setData] = useState([]);
  const [filteredData, setFilteredData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [activeFilters, setActiveFilters] = useState({});
  const [filterSelections, setFilterSelections] = useState({});
  const [openDropdown, setOpenDropdown] = useState(null);
  const filterDropdownRef = useRef(null);
  const filterIconRefs = useRef({});
  const [filterDropdownPosition, setFilterDropdownPosition] = useState({ top: 0, left: 0 });
  const [overdueCount, setOverdueCount] = useState(0);
  const [sortConfig, setSortConfig] = useState({ key: 'Data Limite', direction: 'ascending' });
  const [selectedFileName, setSelectedFileName] = useState('');

  const tableHeaders = useMemo(() => [
    'Chamado',
    'Numero Referencia',
    'Contratante',
    'Serviço',
    'Status',
    'Data Limite',
    'Cliente',
    'CNPJ / CPF',
    'Cidade',
    'Técnico',
    'Prestador',
    'Justificativa do Abono',
  ], []);

  const allowedStatuses = useMemo(() => [
    'ENCAMINHADA',
    'EM TRANSFERÊNCIA',
    'EM CAMPO',
    'REENCAMINHADO',
    'PROCEDIMENTO TÉCNICO'
  ], []);

  const normalizeForComparison = useCallback((str) => {
    if (typeof str !== 'string') return str;
    return str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().trim();
  }, []);

  // Esta função não está sendo usada diretamente na lógica atual,
  // mas a mantemos para referência ou uso futuro.
  // Para evitar o erro ESLint 'no-unused-vars', podemos desabilitar a regra para ela.
  // eslint-disable-next-line no-unused-vars
  const normalizeStatusValue = useCallback((status) => {
    const normalized = normalizeForComparison(status);
    if (normalized.includes('ENCAMINHADA')) return 'ENCAMINHADA';
    if (normalized.includes('EM TRANSFERENCIA')) return 'EM TRANSFERÊNCIA';
    if (normalized.includes('EM CAMPO')) return 'EM CAMPO';
    if (normalized.includes('REENCAMINHADO')) return 'REENCAMINHADO';
    if (normalized.includes('PROCEDIMENTO TECNICO')) return 'PROCEDIMENTO TÉCNICO';
    return status; // Retorna o original se não houver normalização específica
  }, [normalizeForComparison]);

  // Função para formatar a Data Limite para DD/MM/AAAA
  const formatDataLimite = useCallback((dateString) => {
    if (!dateString) return '';
    try {
      // Tenta parsear com o formato DD/MM/YYYY HH:MM:SS ou DD/MM/YYYY
      const parts = dateString.match(/(\d{2})\/(\d{2})\/(\d{4})(?: (\d{2}):(\d{2}):(\d{2}))?/);
      if (parts) {
        const [, day, month, year] = parts;
        return `${day}/${month}/${year}`;
      }
      // Fallback para Date object se o regex falhar
      const date = new Date(dateString);
      if (!isNaN(date.getTime())) {
        return date.toLocaleDateString('pt-BR');
      }
    } catch (e) {
      console.error("Erro ao formatar data:", dateString, e);
    }
    return dateString; // Retorna a string original se não conseguir formatar
  }, []);

  // Função para formatar CNPJ/CPF (agora o backend já remove "=""")
  const formatCnpjCpf = useCallback((value) => {
    if (!value) return '';
    const cleaned = String(value).replace(/\D/g, ''); // Remove tudo que não é dígito
    if (cleaned.length === 11) {
      return cleaned.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4'); // CPF
    }
    if (cleaned.length === 14) {
      return cleaned.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5'); // CNPJ
    }
    return value; // Retorna o valor original se não for CPF nem CNPJ
  }, []);

  // Efeito para calcular o contador de OSs em atraso (AGORA CONTA TODOS OS ATRASADOS)
  useEffect(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0); // Zera a hora para comparar apenas a data

    const count = filteredData.filter(row => {
      const dataLimiteStr = row['Data Limite'];
      if (!dataLimiteStr) return false;

      try {
        const parts = dataLimiteStr.match(/(\d{2})\/(\d{2})\/(\d{4})/);
        if (parts) {
          const [, day, month, year] = parts;
          const dataLimite = new Date(`${month}/${day}/${year}`); // Formato MM/DD/YYYY para Date
          dataLimite.setHours(0, 0, 0, 0);

          // CONTA TODOS OS CHAMADOS COM DATA LIMITE < DATA DE AGORA
          return dataLimite < today;
        }
      } catch (e) {
        console.error("Erro ao comparar data limite para contador:", dataLimiteStr, e);
      }
      return false;
    }).length;
    setOverdueCount(count);
  }, [filteredData]);

  // Efeito para aplicar filtros e ordenação
  useEffect(() => {
    let processedData = [...data];

    // 1. Filtrar por allowedStatuses (sempre ativo)
    const normalizedAllowedStatuses = allowedStatuses.map(s => normalizeForComparison(s));
    processedData = processedData.filter(row => {
      const statusValue = row['Status'];
      // Se o status for undefined ou null, não o inclua na lista de permitidos
      if (statusValue === undefined || statusValue === null) return false;
      return normalizedAllowedStatuses.includes(normalizeForComparison(statusValue));
    });

    // 2. Aplicar filtros de coluna ativos
    Object.keys(activeFilters).forEach(column => {
      if (activeFilters[column].length > 0) {
        processedData = processedData.filter(row => {
          const cellValue = row[column];
          if (cellValue === undefined || cellValue === null) return false; // Ignora linhas com valor indefinido
          return activeFilters[column].includes(normalizeForComparison(cellValue));
        });
      }
    });

    setFilteredData(processedData);
  }, [data, activeFilters, allowedStatuses, normalizeForComparison]);


  // Efeito para fechar dropdowns de filtro ao clicar fora
  useEffect(() => {
    function handleClickOutside(event) {
      if (filterDropdownRef.current && !filterDropdownRef.current.contains(event.target)) {
        let isClickOnFilterIcon = false;
        for (const key in filterIconRefs.current) {
          if (filterIconRefs.current[key] && filterIconRefs.current[key].contains(event.target)) {
            isClickOnFilterIcon = true;
            break;
          }
        }
        if (!isClickOnFilterIcon) {
          setOpenDropdown(null);
        }
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  // Função para abrir/fechar dropdown de filtro
  const toggleFilterDropdown = useCallback((column, event) => {
    event.stopPropagation(); // Impede que o clique se propague e feche o dropdown imediatamente
    if (openDropdown === column) {
      setOpenDropdown(null);
    } else {
      setOpenDropdown(column);
      // Calcula a posição do dropdown
      const iconRect = event.currentTarget.getBoundingClientRect();
      setFilterDropdownPosition({
        top: iconRect.bottom + window.scrollY + 5, // 5px abaixo do ícone
        left: iconRect.left + window.scrollX,
      });

      // Popula as opções de filtro para a coluna
      const uniqueValues = [...new Set(data.map(row => row[column]))]
        .filter(value => value !== undefined && value !== null && String(value).trim() !== '') // Remove undefined, null e strings vazias
        .map(value => normalizeForComparison(value))
        .sort((a, b) => String(a).localeCompare(String(b))); // Garante que a ordenação seja de strings

      setFilterSelections(prev => ({
        ...prev,
        [column]: uniqueValues.map(value => ({
          value: value,
          label: value, // O label pode ser o valor normalizado para consistência
          isChecked: activeFilters[column] ? activeFilters[column].includes(value) : false
        }))
      }));
    }
  }, [openDropdown, data, activeFilters, normalizeForComparison]);

  // Função para lidar com a seleção de opções no filtro
  const handleFilterOptionChange = useCallback((column, value) => {
    setFilterSelections(prev => ({
      ...prev,
      [column]: prev[column].map(option =>
        option.value === value ? { ...option, isChecked: !option.isChecked } : option
      )
    }));
  }, []);

  // Função para aplicar os filtros selecionados
  const applyFilters = useCallback((column) => {
    const selectedValues = filterSelections[column]
      .filter(option => option.isChecked)
      .map(option => option.value);

    setActiveFilters(prev => ({
      ...prev,
      [column]: selectedValues
    }));
    setOpenDropdown(null); // Fecha o dropdown após aplicar
  }, [filterSelections]);

  // Função para limpar os filtros de uma coluna
  const clearFilters = useCallback((column) => {
    setActiveFilters(prev => {
      const newFilters = { ...prev };
      delete newFilters[column];
      return newFilters;
    });
    setFilterSelections(prev => ({
      ...prev,
      [column]: prev[column].map(option => ({ ...option, isChecked: false }))
    }));
    setOpenDropdown(null); // Fecha o dropdown após limpar
  }, []);

  // Função para lidar com o upload do arquivo
  const handleFileUpload = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    setSelectedFileName(file.name);
    setLoading(true);
    setError(null);
    setData([]); // Limpa os dados anteriores
    setFilteredData([]); // Limpa os dados filtrados anteriores
    setActiveFilters({}); // Limpa os filtros ativos
    setFilterSelections({}); // Limpa as seleções de filtro
    setOpenDropdown(null); // Fecha qualquer dropdown aberto

    const formData = new FormData();
    formData.append('file', file);

    try {
      const backendUrl = process.env.REACT_APP_BACKEND_URL || 'http://localhost:3001';
      const response = await axios.post(`${backendUrl}/upload`, formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });
      setData(response.data);
    } catch (err) {
      console.error("Erro ao fazer upload:", err);
      setError("Erro ao carregar o arquivo. Verifique o formato ou tente novamente.");
      setData([]);
    } finally {
      setLoading(false);
    }
  };

  // Função para ordenar a tabela
  const requestSort = useCallback((key) => {
    let direction = 'ascending';
    if (sortConfig.key === key && sortConfig.direction === 'ascending') {
      direction = 'descending';
    }
    setSortConfig({ key, direction });
  }, [sortConfig]);

  // Dados ordenados
  const sortedData = useMemo(() => {
    if (!sortConfig.key) {
      return filteredData;
    }

    const sortableData = [...filteredData];
    sortableData.sort((a, b) => {
      const aValue = normalizeForComparison(a[sortConfig.key]);
      const bValue = normalizeForComparison(b[sortConfig.key]);

      if (aValue < bValue) {
        return sortConfig.direction === 'ascending' ? -1 : 1;
      }
      if (aValue > bValue) {
        return sortConfig.direction === 'ascending' ? 1 : -1;
      }
      return 0;
    });
    return sortableData;
  }, [filteredData, sortConfig, normalizeForComparison]);

  // Função para exportar para Excel
  const exportDataToExcel = useCallback((exportAll = true) => {
    let dataToExport = exportAll ? sortedData : filteredData.filter(row => {
      const dataLimiteStr = row['Data Limite'];
      if (!dataLimiteStr) return false;

      try {
        const parts = dataLimiteStr.match(/(\d{2})\/(\d{2})\/(\d{4})/);
        if (!parts) return false;

        const [, day, month, year] = parts;
        const dataLimite = new Date(`${month}/${day}/${year}`);
        dataLimite.setHours(0, 0, 0, 0);

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        return dataLimite <= today; // Inclui atrasados e os de hoje
      } catch (e) {
        console.error("Erro ao comparar data limite para exportação:", dataLimiteStr, e);
        return false;
      }
    });

    if (dataToExport.length === 0) {
      alert("Não há dados para exportar.");
      return;
    }

    const ws = XLSX.utils.json_to_sheet(dataToExport);

    // Aplica estilos às células
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    dataToExport.forEach((row, rowIndex) => {
      const dataLimiteStr = row['Data Limite'];
      let isOverdue = false;
      let isDueToday = false;
      let isFaltaAbonar = false;

      if (dataLimiteStr) {
        try {
          const parts = dataLimiteStr.match(/(\d{2})\/(\d{2})\/(\d{4})/);
          if (parts) {
            const [, day, month, year] = parts;
            const dataLimite = new Date(`${month}/${day}/${year}`);
            dataLimite.setHours(0, 0, 0, 0);

            isOverdue = dataLimite < today;
            isDueToday = dataLimite.getTime() === today.getTime();
          }
        } catch (e) {
          console.error("Erro ao processar data para estilo de exportação:", dataLimiteStr, e);
        }
      }

      const justificativaAbono = row['Justificativa do Abono'];
      isFaltaAbonar = isOverdue && (justificativaAbono === '' || justificativaAbono === undefined || justificativaAbono === null || normalizeForComparison(justificativaAbono) === 'FALTA ABONAR');


      // Aplica estilo à linha inteira
      const rowStyle = {};
      if (isFaltaAbonar) {
        rowStyle.fill = { fgColor: { rgb: "800080" } }; // Roxo
        rowStyle.font = { color: { rgb: "FFFFFF" }, bold: true };
      } else if (isOverdue) {
        rowStyle.fill = { fgColor: { rgb: "FF0000" } }; // Vermelho
        rowStyle.font = { color: { rgb: "FFFFFF" }, bold: true };
      } else if (isDueToday) {
        rowStyle.fill = { fgColor: { rgb: "FFFF00" } }; // Amarelo
        rowStyle.font = { color: { rgb: "333333" } };
      }

      // Itera sobre as células da linha para aplicar o estilo
      tableHeaders.forEach((header, colIndex) => {
        const cellAddress = XLSX.utils.encode_cell({ r: rowIndex + 1, c: colIndex }); // +1 para pular o cabeçalho
        if (!ws[cellAddress]) ws[cellAddress] = {};
        ws[cellAddress].s = { ...rowStyle }; // Aplica o estilo da linha
      });
    });

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Dados");
    XLSX.writeFile(wb, "tabela_exportada.xlsx");
  }, [sortedData, filteredData, tableHeaders, normalizeForComparison]);


  // Função para obter o conteúdo da célula e a classe CSS
  const getCellContentAndClassName = useCallback((row, header) => {
    let content = row[header];
    let className = '';

    // Formatação específica para CNPJ / CPF
    if (header === 'CNPJ / CPF') {
      content = formatCnpjCpf(content);
    }

    // Formatação específica para Data Limite
    if (header === 'Data Limite') {
      content = formatDataLimite(content);
    }

    // Classe para a célula "FALTA ABONAR"
    if (header === 'Justificativa do Abono') {
      const dataLimiteStr = row['Data Limite'];
      let isOverdue = false;
      if (dataLimiteStr) {
        try {
          const parts = dataLimiteStr.match(/(\d{2})\/(\d{2})\/(\d{4})/);
          if (parts) {
            const [, day, month, year] = parts;
            const dataLimite = new Date(`${month}/${day}/${year}`);
            dataLimite.setHours(0, 0, 0, 0);

            const today = new Date();
            today.setHours(0, 0, 0, 0);

            isOverdue = dataLimite < today;
          }
        } catch (e) {
          console.error("Erro ao processar data para 'FALTA ABONAR' cell:", dataLimiteStr, e);
        }
      }

      const justificativaAbono = row['Justificativa do Abono'];
      if (isOverdue && (justificativaAbono === '' || justificativaAbono === undefined || justificativaAbono === null || normalizeForComparison(justificativaAbono) === 'FALTA ABONAR')) {
        className = 'falta-abonar-cell'; // Classe específica para a célula
      }
    }

    return { content, className };
  }, [formatCnpjCpf, formatDataLimite, normalizeForComparison]);


  // Função para determinar a classe da linha com base na Data Limite
  const getRowClassByDataLimite = useCallback((row) => {
    const dataLimiteStr = row['Data Limite'];
    if (!dataLimiteStr) return '';

    try {
      const parts = dataLimiteStr.match(/(\d{2})\/(\d{2})\/(\d{4})/);
      if (!parts) return '';

      const [, day, month, year] = parts;
      const dataLimite = new Date(`${month}/${day}/${year}`);
      dataLimite.setHours(0, 0, 0, 0);

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const justificativaAbono = row['Justificativa do Abono'];
      const isFaltaAbonar = dataLimite < today && (justificativaAbono === '' || justificativaAbono === undefined || justificativaAbono === null || normalizeForComparison(justificativaAbono) === 'FALTA ABONAR');

      if (isFaltaAbonar) {
        return 'falta-abonar'; // Linha roxa para "FALTA ABONAR"
      } else if (dataLimite < today) {
        return 'overdue-strong'; // Linha vermelha para atrasados
      } else if (dataLimite.getTime() === today.getTime()) {
        return 'due-today'; // Linha amarela para hoje
      }
    } catch (e) {
      console.error("Erro ao determinar classe da linha:", dataLimiteStr, e);
    }
    return '';
  }, [normalizeForComparison]);


  return (
    <div className="App">
      <header className="App-header">
        <h1>Gerenciador de Ordens de Serviço</h1>
        <div className="file-upload-container">
          <label htmlFor="file-upload" className="custom-file-upload">
            <FontAwesomeIcon icon={faFileUpload} />
            {selectedFileName ? `Arquivo: ${selectedFileName}` : 'Escolher Arquivo CSV'}
          </label>
          <input
            id="file-upload"
            type="file"
            accept=".csv"
            onChange={handleFileUpload}
            style={{ display: 'none' }}
          />
          {loading && <p>Carregando...</p>}
          {error && <p className="error-message">{error}</p>}
          {data.length > 0 && (
            <div className="action-buttons">
              <button onClick={() => exportDataToExcel(true)} className="export-button">
                <FontAwesomeIcon icon={faFileExcel} /> Exportar Tabela Completa
              </button>
              <button onClick={() => exportDataToExcel(false)} className="export-button">
                <FontAwesomeIcon icon={faFileExcel} /> Exportar Pendentes de Hoje
              </button>
            </div>
          )}
        </div>
        {data.length > 0 && (
          <div className="overdue-count-container">
            <span className="overdue-count">
              Ordens de Serviço em Atraso: {overdueCount}
            </span>
          </div>
        )}
      </header>

      {data.length > 0 && (
        <div className="data-table-container">
          <table className="data-table">
            <thead>
              <tr>
                {tableHeaders.map((header) => (
                  <th key={header} className={`col-${normalizeForComparison(header).replace(/ /g, '-').replace(/\//g, '-')}`}>
                    <div className="header-content">
                      <span className="sortable-header" onClick={() => requestSort(header)}>
                        {header}
                        {sortConfig.key === header && (
                          <FontAwesomeIcon
                            icon={sortConfig.direction === 'ascending' ? faSortUp : faSortDown}
                            className="sort-icon"
                          />
                        )}
                      </span>
                      <FontAwesomeIcon
                        icon={faFilter}
                        className={`filter-icon ${activeFilters[header] && activeFilters[header].length > 0 ? 'filter-active' : ''}`}
                        onClick={(event) => toggleFilterDropdown(header, event)}
                        ref={el => filterIconRefs.current[header] = el}
                      />
                    </div>
                    {openDropdown === header && (
                      <div
                        className="filter-dropdown"
                        ref={filterDropdownRef}
                        style={{ top: filterDropdownPosition.top, left: filterDropdownPosition.left }}
                      >
                        <div className="filter-options-container">
                          {filterSelections[header] && filterSelections[header].map(option => (
                            <label key={option.value} className="filter-option">
                              <input
                                type="checkbox"
                                checked={option.isChecked}
                                onChange={() => handleFilterOptionChange(header, option.value)}
                              />
                              {option.label}
                            </label>
                          ))}
                        </div>
                        <div className="filter-actions">
                          <button onClick={() => applyFilters(header)}>Aplicar</button>
                          <button onClick={() => clearFilters(header)}>Limpar</button>
                        </div>
                      </div>
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sortedData.map((row, rowIndex) => (
                <tr key={rowIndex} className={getRowClassByDataLimite(row)}>
                  {tableHeaders.map((header) => {
                    const { content, className } = getCellContentAndClassName(row, header);
                    return (
                      <td key={header} className={className}>
                        {content}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default App;
